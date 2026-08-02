import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { kvGet, getCodingDataset, saveCodingDataset, getCodingThemes, saveCodingThemes, KVKeys } from "../lib/store";
import { generateId } from "../lib/uuid";
import type { Env, Survey, CodingDataset, CodingResult, CodingTheme } from "../types";

const aiCoding = new Hono<{ Bindings: Env }>();
aiCoding.use("*", authMiddleware());

// Get coding themes for a survey
aiCoding.get("/surveys/:id/themes", async (c) => {
  const surveyId = c.req.param("id");
  const themes = await getCodingThemes(c.env.KV, surveyId);
  return c.json({ themes });
});

// Update coding themes for a survey
aiCoding.put("/surveys/:id/themes", async (c) => {
  const surveyId = c.req.param("id");
  const { themes } = await c.req.json<{ themes: CodingTheme[] }>();
  await saveCodingThemes(c.env.KV, surveyId, themes);
  return c.json({ message: "主题更新成功" });
});

// Get coding dataset for a specific question
aiCoding.get("/surveys/:id/coding/:questionId", async (c) => {
  const surveyId = c.req.param("id");
  const questionId = c.req.param("questionId");
  const dataset = await getCodingDataset(c.env.KV, surveyId, questionId);
  return c.json({ dataset: dataset || { survey_id: surveyId, question_id: questionId, themes: [], results: [], total_responses: 0, coded_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
});

// Run AI auto-coding for a question
aiCoding.post("/surveys/:id/coding/:questionId/run", async (c) => {
  const surveyId = c.req.param("id");
  const questionId = c.req.param("questionId");
  
  // Get survey and responses
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  const responses = (await kvGet<any[]>(c.env.KV, "data:responses:" + surveyId)) || [];
  const question = survey.questions.find(q => q.id === questionId);
  if (!question) return c.json({ error: "题目不存在" }, 404);
  
  // Get existing themes
  const themes = await getCodingThemes(c.env.KV, surveyId);
  
  // Get existing dataset
  let dataset = await getCodingDataset(c.env.KV, surveyId, questionId);
  
  // Collect all text answers for this question
  const textAnswers: { response_id: string; text: string; user_uuid: string; submitted_at: string }[] = [];
  for (const resp of responses) {
    const answer = resp.answers?.[questionId];
    if (answer && typeof answer === "string" && answer.trim()) {
      textAnswers.push({
        response_id: resp.id,
        text: answer.trim(),
        user_uuid: resp.user_uuid,
        submitted_at: resp.submitted_at
      });
    }
  }
  
  // Simple AI coding simulation (in production, call real AI API)
  const results: CodingResult[] = [];
  const defaultThemes = themes.length > 0 ? themes : [
    { id: "positive", name: "正面评价", description: "积极正向的反馈", color: "#22c55e" },
    { id: "negative", name: "负面评价", description: "消极负向的反馈", color: "#ef4444" },
    { id: "suggestion", name: "改进建议", description: "提出的改进建议", color: "#3b82f6" },
    { id: "question", name: "疑问咨询", description: "提出的问题或疑问", color: "#f59e0b" },
    { id: "other", name: "其他", description: "其他类型的内容", color: "#6b7280" }
  ];
  
  // Simple keyword-based coding simulation
  const positiveKeywords = ["好", "棒", "优秀", "满意", "喜欢", "推荐", "不错", "赞"];
  const negativeKeywords = ["差", "不好", "失望", "糟糕", "不满", "问题", "困难"];
  const suggestionKeywords = ["建议", "希望", "改进", "优化", "应该", "可以"];
  const questionKeywords = ["怎么", "为什么", "如何", "吗", "能否", "请问"];
  
  for (const item of textAnswers) {
    const lowerText = item.text.toLowerCase();
    const matchedThemes: string[] = [];
    const keywords: string[] = [];
    
    // Simple keyword matching
    for (const kw of positiveKeywords) {
      if (lowerText.includes(kw)) { matchedThemes.push("positive"); keywords.push(kw); }
    }
    for (const kw of negativeKeywords) {
      if (lowerText.includes(kw)) { matchedThemes.push("negative"); keywords.push(kw); }
    }
    for (const kw of suggestionKeywords) {
      if (lowerText.includes(kw)) { matchedThemes.push("suggestion"); keywords.push(kw); }
    }
    for (const kw of questionKeywords) {
      if (lowerText.includes(kw)) { matchedThemes.push("question"); keywords.push(kw); }
    }
    
    // If no match, assign "other"
    if (matchedThemes.length === 0) {
      matchedThemes.push("other");
    }
    
    // Determine sentiment
    const sentiment = matchedThemes.includes("positive") ? "positive" :
                     matchedThemes.includes("negative") ? "negative" : "neutral";
    
    results.push({
      response_id: item.response_id,
      question_id: questionId,
      original_text: item.text,
      themes: [...new Set(matchedThemes)],
      keywords: [...new Set(keywords)],
      sentiment,
      confidence: matchedThemes.length > 0 ? 0.7 : 0.3,
      created_at: new Date().toISOString()
    });
  }
  
  // Save dataset
  const newDataset: CodingDataset = {
    survey_id: surveyId,
    question_id: questionId,
    themes: defaultThemes,
    results,
    total_responses: textAnswers.length,
    coded_count: results.length,
    created_at: dataset?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await saveCodingDataset(c.env.KV, newDataset);
  await saveCodingThemes(c.env.KV, surveyId, defaultThemes);
  
  return c.json({ 
    message: "AI编码完成", 
    dataset: newDataset,
    summary: {
      total: textAnswers.length,
      coded: results.length,
      themes_distribution: defaultThemes.map(t => ({
        theme: t.name,
        count: results.filter(r => r.themes.includes(t.id)).length
      }))
    }
  });
});

// Update a single coding result (manual correction)
aiCoding.put("/surveys/:id/coding/:questionId/result/:responseId", async (c) => {
  const surveyId = c.req.param("id");
  const questionId = c.req.param("questionId");
  const responseId = c.req.param("responseId");
  const { themes, keywords } = await c.req.json<{ themes: string[]; keywords?: string[] }>();
  
  const dataset = await getCodingDataset(c.env.KV, surveyId, questionId);
  if (!dataset) return c.json({ error: "编码数据集不存在" }, 404);
  
  const resultIndex = dataset.results.findIndex(r => r.response_id === responseId);
  if (resultIndex === -1) return c.json({ error: "编码结果不存在" }, 404);
  
  dataset.results[resultIndex].themes = themes;
  if (keywords) dataset.results[resultIndex].keywords = keywords;
  dataset.results[resultIndex].manually_edited = true;
  dataset.updated_at = new Date().toISOString();
  
  await saveCodingDataset(c.env.KV, dataset);
  return c.json({ message: "编码更新成功", result: dataset.results[resultIndex] });
});

// Export coding dataset
aiCoding.get("/surveys/:id/coding/:questionId/export", async (c) => {
  const surveyId = c.req.param("id");
  const questionId = c.req.param("questionId");
  const format = c.req.query("format") || "csv";
  
  const dataset = await getCodingDataset(c.env.KV, surveyId, questionId);
  if (!dataset) return c.json({ error: "编码数据集不存在" }, 404);
  
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  const question = survey?.questions.find(q => q.id === questionId);
  
  if (format === "csv") {
    const headers = ["response_id", "original_text", "themes", "keywords", "sentiment", "confidence", "manually_edited"];
    const rows = dataset.results.map(r => [
      r.response_id,
      `"${r.original_text.replace(/"/g, '""')}"`,
      `"${r.themes.join(";")}"`,
      `"${r.keywords.join(";")}"`,
      r.sentiment || "",
      r.confidence,
      r.manually_edited ? "是" : "否"
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="coding_${questionId}.csv"`
      }
    });
  }
  
  return c.json({ dataset });
});

// Batch delete coding results
aiCoding.delete("/surveys/:id/coding/:questionId/results", async (c) => {
  const surveyId = c.req.param("id");
  const questionId = c.req.param("questionId");
  const { responseIds } = await c.req.json<{ responseIds: string[] }>();
  
  const dataset = await getCodingDataset(c.env.KV, surveyId, questionId);
  if (!dataset) return c.json({ error: "编码数据集不存在" }, 404);
  
  dataset.results = dataset.results.filter(r => !responseIds.includes(r.response_id));
  dataset.coded_count = dataset.results.length;
  dataset.updated_at = new Date().toISOString();
  
  await saveCodingDataset(c.env.KV, dataset);
  return c.json({ message: "删除成功", remaining: dataset.results.length });
});

export default aiCoding;