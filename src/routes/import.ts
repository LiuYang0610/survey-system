import { Hono } from "hono";
import { generateId } from "../lib/uuid";
import { authMiddleware } from "../middleware/auth";
import { kvGet, kvPut, KVKeys } from "../lib/store";
import type { Env, Survey } from "../types";

const importRoutes = new Hono<{ Bindings: Env }>();
importRoutes.use("*", authMiddleware());

function cleanText(text: string): string {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map(l => l.trim()).filter(l => l.length > 0).join("\n");
}

function parseSurveyText(text: string) {
  const lines = cleanText(text).split("\n");
  if (lines.length === 0) throw new Error("文档内容为空");
  
  const title = lines[0].replace(/^[#\s]+/, "").trim();
  let description = "";
  let startIdx = 1;
  
  if (lines.length > 1 && !/^\d+[、.．]/.test(lines[1])) {
    description = lines[1].trim();
    startIdx = 2;
  }
  
  const questions: any[] = [];
  let current: any = null;
  let currentOptions: string[] = [];
  let pendingBlank = false;
  
  // 题目行：数字编号开头
  const qRegex = /^(\d{1,3})[、.．)）]\s*(.+)/;
  // 类型标注：单选/多选/可多选/填空/简答/量表/评分/判断
  const typeRegex = /[【\[（(]\s*(单选|多选|可多选|多项选择|填空|简答|问答|量表|评分|判断)\s*[】\]）)]/;
  const reqRegex = /[【\[（(]\s*(必填|required)\s*[】\]）)]/i;
  // 选项行：字母 / 括号数字 / 圈号 / 中文序号 / 符号 开头
  const optRegex = /^(?:[（(]?[A-Za-z][)）．.、:：]\s*|（\d{1,2}）\s*|[\u2460-\u2473]\s*|[一二三四五六七八九十]{1,3}[、.．]\s*|[□○●■☑☐✔√]\s*)(.+)$/;
  // 题干内嵌选项：1. 您的性别：A.男 B.女
  const inlineOptRegex = /^(.*?)[：:]\s*(.+)$/;
  
  const TYPE_MAP: Record<string, string> = {
    "单选": "single", "多选": "multiple", "可多选": "multiple", "多项选择": "multiple",
    "填空": "text", "简答": "text", "问答": "text",
    "量表": "scale", "评分": "scale", "判断": "single"
  };
  
  // 常见量表标签对（无标注时后验识别）
  const SCALE_PAIRS: [string, string][] = [
    ["非常不满意", "非常满意"],
    ["很不满意", "很满意"],
    ["完全不符合", "完全符合"],
    ["非常不同意", "非常同意"],
    ["很不符合", "很符合"],
    ["从不", "总是"],
  ];
  
  function detectScaleFromOptions(options: string[]) {
    for (const pair of SCALE_PAIRS) {
      if (options.some(o => o.includes(pair[0])) && options.some(o => o.includes(pair[1]))) {
        return {
          scale_min: 1,
          scale_max: options.length,
          scale_min_label: options[0],
          scale_max_label: options[options.length - 1],
        };
      }
    }
    return null;
  }
  
  function splitInlineOptions(rest: string): string[] | null {
    const parts = rest.split(/(?=[A-Za-z]\s*[.、．)）])/).map(s => s.trim()).filter(Boolean);
    const opts: string[] = [];
    for (const part of parts) {
      const m = part.match(/^[A-Za-z]\s*[.、．)）]\s*(.+)$/);
      if (m) opts.push(m[1].trim());
    }
    return opts.length >= 2 ? opts : null;
  }
  
  function finishQuestion() {
    if (!current) return;
    
    // 有选项但类型仍是 text → 尝试量表，否则单选
    if (currentOptions.length >= 2 && current.type === "text") {
      const scale = detectScaleFromOptions(currentOptions);
      if (scale) {
        current.type = "scale";
        current.scale_min = scale.scale_min;
        current.scale_max = scale.scale_max;
        current.scale_min_label = scale.scale_min_label;
        current.scale_max_label = scale.scale_max_label;
        current.options = [];
      } else {
        current.type = "single";
      }
    }
    
    // 判断题无选项时自动补充
    if (current.type === "single" && currentOptions.length === 0) {
      if (/判断|是否正确|对错/.test(current.title)) currentOptions = ["正确", "错误"];
      else if (/是否/.test(current.title)) currentOptions = ["是", "否"];
    }
    
    // 独立行选项块 + 下划线：拆分为 单选 + 补充填空
    if (pendingBlank && currentOptions.length >= 2) {
      const blankTitle = (current.title || "").replace(/[？?]\s*$/, "") + "？";
      current.options = currentOptions;
      if (current.type === "text") current.type = "single";
      questions.push(current);
      current = {
        sort_order: questions.length + 1, type: "text",
        title: blankTitle + "（补充说明）", description: "如有其他情况，请填写说明",
        required: false, options: [], scale_min: 1, scale_max: 5,
        scale_min_label: "非常不满意", scale_max_label: "非常满意",
        skip_logic: { enabled: false, conditions: [] },
      };
      currentOptions = [];
      pendingBlank = false;
      return;
    }
    
    current.options = currentOptions;
    questions.push(current);
    current = null;
    currentOptions = [];
    pendingBlank = false;
  }
  
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const qMatch = line.match(qRegex);
    
    if (qMatch) {
      finishQuestion();
      
      let qTitle = qMatch[2].trim();
      let type: any = "text";
      let required = false;
      
      // 1) 显式类型标注
      const tm = qTitle.match(typeRegex);
      if (tm) {
        type = TYPE_MAP[tm[1]] || "text";
        if (tm[1] === "判断") currentOptions = ["正确", "错误"];
        qTitle = qTitle.replace(typeRegex, "").trim();
      }
      
      // 2) 关键词兜底识别
      if (type === "text") {
        if (/多选|可多选|多项|不定项|选择所有|不限选/.test(qTitle)) type = "multiple";
        else if (/量表|评分|打分|程度/.test(qTitle)) type = "scale";
        else if (/判断|是否正确|对错/.test(qTitle)) type = "single";
        else if (/是否同意|是否/.test(qTitle)) type = "single";
        else if (/填空|简答|问答|请写|请说明|请描述|意见|建议|理由/.test(qTitle)) type = "text";
      }
      
      // 3) 必填标注
      if (reqRegex.test(qTitle)) {
        required = true;
        qTitle = qTitle.replace(reqRegex, "").trim();
      }
      
      // 4) 题干内嵌选项：1. 您的性别：A.男 B.女
      const inline = qTitle.match(inlineOptRegex);
      if (inline) {
        const opts = splitInlineOptions(inline[2]);
        if (opts) {
          qTitle = inline[1].trim();
          currentOptions = opts;
        }
      }
      
      // 5) 同行选项块（\u25A1 = □）：拆分为单选 + 补充填空
      if (/\u25A1/.test(qTitle) && !pendingBlank) {
        const boxOpts = [...qTitle.matchAll(/\u25A1([^\u25A1\s\uFF3F_]+)/g)].map(m => m[1].trim()).filter(Boolean);
        if (boxOpts.length >= 2) {
          const hasBlank = /[\uFF3F_]{2,}/.test(qTitle);
          const cleanTitle = qTitle
            .replace(/\u25A1[^\u25A1\s]*(?:\s*\u25A1[^\u25A1\s]*)*/g, "")
            .replace(/[\uFF3F_]{2,}/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[？?]\s*$/, "") + "？";
          currentOptions = boxOpts;
          if (hasBlank) {
            questions.push({
              sort_order: questions.length + 1, type: "single", title: cleanTitle, description: "",
              required, options: currentOptions, scale_min: 1, scale_max: 5,
              scale_min_label: "非常不满意", scale_max_label: "非常满意",
              skip_logic: { enabled: false, conditions: [] },
            });
            current = {
              sort_order: questions.length + 1, type: "text",
              title: cleanTitle + "（补充说明）", description: "如有其他情况，请填写说明",
              required: false, options: [], scale_min: 1, scale_max: 5,
              scale_min_label: "非常不满意", scale_max_label: "非常满意",
              skip_logic: { enabled: false, conditions: [] },
            };
            currentOptions = [];
            pendingBlank = false;
            continue;
          }
          qTitle = cleanTitle;
        }
      }
      
      current = {
        sort_order: questions.length + 1, type, title: qTitle, description: "",
        required, options: [], scale_min: 1, scale_max: 5,
        scale_min_label: "非常不满意", scale_max_label: "非常满意",
        skip_logic: { enabled: false, conditions: [] },
      };
      continue;
    }
    
    if (current) {
      // 独立行选项块
      if (line.includes("\u25A1")) {
        const boxOpts = [...line.matchAll(/\u25A1([^\u25A1\s\uFF3F_]+)/g)].map(m => m[1].trim()).filter(Boolean);
        if (boxOpts.length >= 2) {
          currentOptions = boxOpts;
          if (/[\uFF3F_]{2,}/.test(line)) pendingBlank = true;
          continue;
        }
      }
      // 纯下划线行 → 标记补充填空
      if (/^[\uFF3F_]{2,}\s*$/.test(line)) {
        pendingBlank = true;
        continue;
      }
      const om = line.match(optRegex);
      if (om) currentOptions.push(om[1].trim());
    }
  }
  finishQuestion();
  
  return { title, description, questions };
}

function generateUniqueKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}

async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(Buffer.from(buffer));
    return data.text || "";
  } catch (error: any) {
    throw new Error("PDF解析失败: " + error.message);
  }
}

importRoutes.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "未找到文件" }, 400);
  
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["xlsx", "docx", "pdf"].includes(ext || "")) {
    return c.json({ error: "仅支持 .xlsx / .docx / .pdf 格式" }, 400);
  }
  
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: "文件不能超过 10MB" }, 400);
  }
  
  try {
    const buffer = await file.arrayBuffer();
    let text = "";
    
    if (ext === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("Excel 文件无工作表");
      
      const lines: string[] = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell((cell) => {
          if (cell.value != null) cells.push(String(cell.value));
        });
        if (cells.length > 0) lines.push(cells.join(" | "));
      });
      // Excel 常见结构：第一列是题号（如“1 | 题干”），转换为标准“1. 题干”格式
      for (let li = 0; li < lines.length; li++) {
        const lm = lines[li].match(/^(\d{1,3})\s*\|\s*(.+)$/);
        if (lm) lines[li] = lm[1] + ". " + lm[2].trim();
      }
      text = lines.join("\n");
    } else if (ext === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value;
    } else if (ext === "pdf") {
      text = await parsePdf(buffer);
    }
    
    if (!text || text.trim().length === 0) {
      return c.json({ error: "文件内容为空" }, 400);
    }
    
    const parsed = parseSurveyText(text);
    return c.json({
      title: parsed.title,
      description: parsed.description,
      questions: parsed.questions,
      source_file: file.name,
      source_type: ext
    });
  } catch (err: any) {
    return c.json({ error: "解析失败: " + err.message }, 400);
  }
});

importRoutes.post("/confirm", async (c) => {
  const user = c.get("admin");
  const { title, description, questions } = await c.req.json<{
    title: string;
    description?: string;
    questions: any[];
  }>();
  
  if (!title || !questions?.length) {
    return c.json({ error: "请提供标题和题目" }, 400);
  }
  
  const surveyId = generateId();
  const uniqueKey = generateUniqueKey();
  const now = new Date().toISOString();
  
  // 使用用户特定的存储路径
  const surveyKey = `survey:${user.username}:${surveyId}`;
  
  const survey: Survey = {
    id: surveyId,
    unique_key: uniqueKey,
    title,
    description: description || "",
    status: "active",
    allow_resubmit: 0,
    created_by: user.username,
    created_at: now,
    updated_at: now,
    questions: questions.map((q: any, idx: number) => ({
      id: generateId(),
      sort_order: q.sort_order || idx + 1,
      type: q.type,
      title: q.title,
      description: q.description || "",
      required: q.required ? 1 : 0,
      options: q.options || [],
      scale_min: q.scale_min || 1,
      scale_max: q.scale_max || 5,
      scale_min_label: q.scale_min_label || "非常不满意",
      scale_max_label: q.scale_max_label || "非常满意",
      skip_logic: q.skip_logic || null,
    })),
  };
  
  // 保存问卷到用户空间
  await kvPut(c.env.KV, surveyKey, survey);
  
  // 更新用户的问卷列表
  const listKey = `surveys:${user.username}`;
  const list = (await kvGet<string[]>(c.env.KV, listKey)) || [];
  list.unshift(surveyId);
  await kvPut(c.env.KV, listKey, list);
  
  // 创建 unique_key 到问卷的映射索引
  const uniqueKeyIndexKey = `surveyByKey:${uniqueKey}`;
  await kvPut(c.env.KV, uniqueKeyIndexKey, {
    username: user.username,
    surveyId: surveyId,
  });
  
  // 初始化统计
  await kvPut(c.env.KV, `stats:${user.username}:${surveyId}`, { views: 0, starts: 0, submissions: 0 });
  
  return c.json({ 
    survey_id: surveyId, 
    unique_key: uniqueKey,
    message: "导入成功" 
  });
});

export default importRoutes;
