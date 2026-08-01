// 文件导入路由（KV 版 - 内存解析，无需 R2）
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import { authMiddleware } from '../middleware/auth';
import { kvGet, kvPut, KVKeys } from '../lib/store';
import type { Env, Survey, Question } from '../types';

const importRoutes = new Hono<{ Bindings: Env }>();
importRoutes.use('*', authMiddleware());

// 通用文本清洗
function cleanText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(l => l.length > 0)
    .join('\n');
}

// 解析问卷文本
function parseSurveyText(text: string) {
  const lines = cleanText(text).split('\n');
  if (lines.length === 0) throw new Error('文档内容为空');

  const title = lines[0].replace(/^[#\s]+/, '').trim();
  let description = '';
  let startIdx = 1;

  if (lines.length > 1 && !/^\d+[、.．]/.test(lines[1])) {
    description = lines[1].trim();
    startIdx = 2;
  }

  const questions: any[] = [];
  let current: any = null;
  let currentOptions: string[] = [];

  const qRegex = /^(\d+)[、.．]\s*(.+)/;
  const typeRegex = /【(单选|多选|填空|量表)】/;
  const reqRegex = /【必填】/;
  const optRegex = /^[A-Za-z]\s*[、.．]\s*(.+)/;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const qMatch = line.match(qRegex);

    if (qMatch) {
      if (current) { current.options = currentOptions; questions.push(current); }
      let qTitle = qMatch[2];
      let type: any = 'single';
      let required = false;

      const tm = qTitle.match(typeRegex);
      if (tm) {
        const map: Record<string, string> = { '单选': 'single', '多选': 'multiple', '填空': 'text', '量表': 'scale' };
        type = map[tm[1]] || 'single';
        qTitle = qTitle.replace(typeRegex, '').trim();
      }
      if (reqRegex.test(qTitle)) { required = true; qTitle = qTitle.replace(reqRegex, '').trim(); }

      current = {
        sort_order: parseInt(qMatch[1]),
        type, title: qTitle, description: '', required,
        options: [], scale_min: 1, scale_max: 5,
        scale_min_label: '非常不满意', scale_max_label: '非常满意',
      };
      currentOptions = [];
      continue;
    }

    if (current && optRegex.test(line)) {
      const m = line.match(optRegex);
      if (m) currentOptions.push(m[1].trim());
    }
  }

  if (current) { current.options = currentOptions; questions.push(current); }
  return { title, description, questions };
}

// 上传并解析（前端通过 FormData 上传文件）
importRoutes.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  if (!file) return c.json({ error: '未找到文件' }, 400);

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'docx', 'pdf'].includes(ext || '')) {
    return c.json({ error: '仅支持 .xlsx / .docx / .pdf 格式' }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: '文件不能超过 10MB' }, 400);
  }

  try {
    const buffer = await file.arrayBuffer();
    let text = '';

    if (ext === 'xlsx') {
      // 动态导入 exceljs
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('Excel 文件无工作表');
      const lines: string[] = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell((cell) => { if (cell.value != null) cells.push(String(cell.value)); });
        if (cells.length > 0) lines.push(cells.join(' | '));
      });
      text = lines.join('\n');
    } else if (ext === 'docx') {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value;
    } else if (ext === 'pdf') {
      const { getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const lines: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ').trim();
        if (pageText) lines.push(pageText);
      }
      text = lines.join('\n');
    }

    if (!text || text.trim().length === 0) {
      return c.json({ error: '文件内容为空，或为扫描件/图片PDF' }, 400);
    }

    const parsed = parseSurveyText(text);
    return c.json({ title: parsed.title, description: parsed.description, questions: parsed.questions });
  } catch (err: any) {
    return c.json({ error: `解析失败: ${err.message}` }, 400);
  }
});

// 确认导入创建问卷
importRoutes.post('/confirm', async (c) => {
  const { title, description, questions } = await c.req.json<{
    title: string; description?: string; questions: any[];
  }>();
  if (!title || !questions?.length) return c.json({ error: '请提供标题和题目' }, 400);

  const surveyId = generateId();
  const uniqueKey = generateUniqueKey();
  const now = new Date().toISOString();

  const survey: Survey = {
    id: surveyId,
    unique_key: uniqueKey,
    title,
    description: description || '',
    status: 'active',
    allow_resubmit: 0,
    created_by: c.get('admin').username,
    created_at: now,
    updated_at: now,
    questions: questions.map((q: any, idx: number) => ({
      id: generateId(),
      sort_order: q.sort_order || idx + 1,
      type: q.type,
      title: q.title,
      description: q.description || '',
      required: q.required ? 1 : 0,
      options: q.options || [],
      scale_min: q.scale_min || 1,
      scale_max: q.scale_max || 5,
      scale_min_label: q.scale_min_label || '非常不满意',
      scale_max_label: q.scale_max_label || '非常满意',
    })),
  };

  await kvPut(c.env.KV, KVKeys.survey(surveyId), survey);
  await kvPut(c.env.KV, KVKeys.surveyByKey(uniqueKey), surveyId);
  await kvListAppend(c.env.KV, KVKeys.surveyList(), surveyId);
  await kvPut(c.env.KV, KVKeys.stats(surveyId), { views: 0, starts: 0, submissions: 0 });

  return c.json({ survey_id: surveyId, unique_key: uniqueKey, message: '导入成功' });
});

// generateUniqueKey 的本地引用
function generateUniqueKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

export default importRoutes;
