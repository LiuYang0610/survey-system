import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { kvGet, saveQualityReport, getDefaultAnomalyRules, KVKeys } from "../lib/store";
import type { Env, Survey, SurveyResponse, AnomalyRule, AnomalyResult, AnomalyFlag, DataQualityReport } from "../types";

const dataQuality = new Hono<{ Bindings: Env }>();
dataQuality.use("*", authMiddleware());

// Get anomaly detection rules
dataQuality.get("/rules", async (c) => {
  const rules = await getDefaultAnomalyRules();
  return c.json({ rules });
});

// Run anomaly detection for a survey
dataQuality.post("/surveys/:id/scan", async (c) => {
  const surveyId = c.req.param("id");
  const user = c.get("admin");
  
  // Get survey - 使用用户特定的存储路径
  const survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  // Get responses - 使用正确的存储键格式
  const responsesKey = `responses:${user.username}:${surveyId}`;
  const responses = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  
  if (responses.length === 0) return c.json({ error: "暂无答卷数据" }, 400);
  
  // Get rules
  const rules = await getDefaultAnomalyRules();
  const enabledRules = rules.filter(r => r.enabled);
  
  // Analyze each response
  const results: AnomalyResult[] = [];
  let anomalousCount = 0;
  
  for (const resp of responses) {
    const flags: AnomalyFlag[] = [];
    let totalScore = 0;
    
    // Rule 1: Speed detection (if duration data available)
    const speedRule = enabledRules.find(r => r.type === "speed");
    if (speedRule && resp.duration_seconds) {
      const minSeconds = speedRule.config.min_seconds || 30;
      if (resp.duration_seconds < minSeconds) {
        const severity: "low" | "medium" | "high" = resp.duration_seconds < minSeconds / 2 ? "high" : "medium";
        flags.push({
          rule_id: "speed",
          rule_name: speedRule.name,
          severity,
          details: `作答时间仅 ${resp.duration_seconds} 秒，低于最低要求 ${minSeconds} 秒`,
          evidence: { duration: resp.duration_seconds, threshold: minSeconds }
        });
        totalScore += severity === "high" ? 30 : 20;
      }
    }
    
    // Rule 2: Pattern detection (consecutive same options)
    const patternRule = enabledRules.find(r => r.type === "pattern");
    if (patternRule) {
      const answers = Object.values(resp.answers || {});
      let consecutiveCount = 1;
      let maxConsecutive = 1;
      
      for (let i = 1; i < answers.length; i++) {
        if (JSON.stringify(answers[i]) === JSON.stringify(answers[i - 1])) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else {
          consecutiveCount = 1;
        }
      }
      
      const threshold = patternRule.config.min_consecutive || 5;
      if (maxConsecutive >= threshold) {
        flags.push({
          rule_id: "pattern",
          rule_name: patternRule.name,
          severity: maxConsecutive >= threshold * 2 ? "high" : "medium",
          details: `连续 ${maxConsecutive} 题选择相同选项`,
          evidence: { max_consecutive: maxConsecutive, threshold }
        });
        totalScore += 25;
      }
    }
    
    // Rule 3: Logic contradiction detection
    const logicRule = enabledRules.find(r => r.type === "logic");
    if (logicRule && survey.questions) {
      const answers = resp.answers || {};
      // Simple check: look for contradictions in related questions
      for (let i = 0; i < survey.questions.length; i++) {
        for (let j = i + 1; j < survey.questions.length; j++) {
          const q1 = survey.questions[i];
          const q2 = survey.questions[j];
          const a1 = answers[q1.id];
          const a2 = answers[q2.id];
          
          // Check for contradictory answers (e.g., very satisfied vs very dissatisfied)
          if (q1.type === "single" && q2.type === "single" && a1 && a2) {
            if ((a1 === "非常满意" && a2 === "非常不满意") || (a1 === "非常不满意" && a2 === "非常满意")) {
              flags.push({
                rule_id: "logic",
                rule_name: logicRule.name,
                severity: "medium",
                details: `第 ${q1.sort_order} 题和第 ${q2.sort_order} 题答案存在逻辑矛盾`,
                evidence: { q1: q1.title, a1, q2: q2.title, a2 }
              });
              totalScore += 20;
            }
          }
        }
      }
    }
    
    // Rule 4: Range detection (for scale questions)
    const rangeRule = enabledRules.find(r => r.type === "range");
    if (rangeRule && survey.questions) {
      for (const q of survey.questions) {
        if (q.type === "scale") {
          const answer = resp.answers?.[q.id];
          if (answer !== undefined && answer !== null) {
            const num = Number(answer);
            if (isNaN(num) || num < q.scale_min || num > q.scale_max) {
              flags.push({
                rule_id: "range",
                rule_name: rangeRule.name,
                severity: "high",
                details: `第 ${q.sort_order} 题数值 ${answer} 超出合理区间 [${q.scale_min}-${q.scale_max}]`,
                evidence: { value: answer, min: q.scale_min, max: q.scale_max }
              });
              totalScore += 30;
            }
          }
        }
      }
    }
    
    // Rule 5: Gibberish detection (for text questions)
    const gibberishRule = enabledRules.find(r => r.type === "gibberish");
    if (gibberishRule && survey.questions) {
      for (const q of survey.questions) {
        if (q.type === "text") {
          const answer = resp.answers?.[q.id];
          if (answer && typeof answer === "string") {
            // Check for gibberish patterns
            const hasGibberish = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{3,}/.test(answer) ||
                                  /\u4e00-\u9fa5/.test(answer) === false && answer.length > 2;
            const meaningfulRatio = answer.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").length / Math.max(answer.length, 1);
            
            if (hasGibberish || meaningfulRatio < 0.3) {
              flags.push({
                rule_id: "gibberish",
                rule_name: gibberishRule.name,
                severity: "high",
                details: `第 ${q.sort_order} 题文本疑似乱码填充`,
                evidence: { answer: answer.substring(0, 100), meaningful_ratio: meaningfulRatio }
              });
              totalScore += 30;
            }
          }
        }
      }
    }
    
    // Determine if anomalous (threshold: 50)
    const isAnomalous = totalScore >= 50;
    if (isAnomalous) anomalousCount++;
    
    results.push({
      response_id: resp.id,
      user_uuid: resp.user_uuid,
      submitted_at: resp.submitted_at,
      total_score: totalScore,
      flags,
      is_anomalous: isAnomalous
    });
  }
  
  // Sort by score descending
  results.sort((a, b) => b.total_score - a.total_score);
  
  // Generate report
  const report: DataQualityReport = {
    survey_id: surveyId,
    total_responses: responses.length,
    anomalous_count: anomalousCount,
    clean_count: responses.length - anomalousCount,
    anomaly_rate: responses.length > 0 ? Math.round((anomalousCount / responses.length) * 100) : 0,
    results,
    rules: enabledRules,
    generated_at: new Date().toISOString()
  };
  
  await saveQualityReport(c.env.KV, report);
  
  return c.json({
    message: "质量检测完成",
    report,
    summary: {
      total: responses.length,
      anomalous: anomalousCount,
      clean: responses.length - anomalousCount,
      rate: report.anomaly_rate,
      by_rule: enabledRules.map(r => ({
        rule: r.name,
        triggered: results.filter(res => res.flags.some(f => f.rule_id === r.id)).length
      }))
    }
  });
});

// Get existing quality report
dataQuality.get("/surveys/:id/report", async (c) => {
  const surveyId = c.req.param("id");
  const report = await kvGet<DataQualityReport>(c.env.KV, KVKeys.qualityReport(surveyId));
  if (!report) return c.json({ error: "暂无检测报告" }, 404);
  return c.json({ report });
});

// Flag/unflag a response
dataQuality.put("/surveys/:id/responses/:responseId/flag", async (c) => {
  const surveyId = c.req.param("id");
  const responseId = c.req.param("responseId");
  const user = c.get("admin");
  const { is_flagged, flag_reasons } = await c.req.json<{ is_flagged: boolean; flag_reasons?: string[] }>();
  
  const responsesKey = `responses:${user.username}:${surveyId}`;
  const indexData = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  const responseIndex = indexData.findIndex(r => r.id === responseId);
  
  if (responseIndex === -1) return c.json({ error: "答卷不存在" }, 404);
  
  indexData[responseIndex].is_flagged = is_flagged;
  indexData[responseIndex].flag_reasons = flag_reasons || [];
  
  await kvPut(c.env.KV, responsesKey, indexData);
  
  return c.json({ message: is_flagged ? "已标记" : "已取消标记" });
});

// Batch flag/unflag responses
dataQuality.put("/surveys/:id/responses/batch-flag", async (c) => {
  const surveyId = c.req.param("id");
  const user = c.get("admin");
  const { responseIds, is_flagged, flag_reasons } = await c.req.json<{ responseIds: string[]; is_flagged: boolean; flag_reasons?: string[] }>();
  
  const responsesKey = `responses:${user.username}:${surveyId}`;
  const indexData = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  
  for (const resp of indexData) {
    if (responseIds.includes(resp.id)) {
      resp.is_flagged = is_flagged;
      resp.flag_reasons = flag_reasons || [];
    }
  }
  
  await kvPut(c.env.KV, responsesKey, indexData);
  
  return c.json({ message: `已${is_flagged ? "标记" : "取消标记"} ${responseIds.length} 份答卷` });
});

// Export quality report
dataQuality.get("/surveys/:id/export", async (c) => {
  const surveyId = c.req.param("id");
  const format = c.req.query("format") || "csv";
  
  const report = await kvGet<DataQualityReport>(c.env.KV, KVKeys.qualityReport(surveyId));
  if (!report) return c.json({ error: "暂无检测报告" }, 404);
  
  if (format === "csv") {
    const headers = ["response_id", "user_uuid", "submitted_at", "total_score", "is_anomalous", "flags"];
    const rows = report.results.map(r => [
      r.response_id,
      r.user_uuid,
      r.submitted_at,
      r.total_score,
      r.is_anomalous ? "是" : "否",
      `"${r.flags.map(f => f.rule_name).join(";")}"`
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quality_report_${surveyId}.csv"`
      }
    });
  }
  
  return c.json({ report });
});

export default dataQuality;
