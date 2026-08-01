// 文件导入路由
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import { authMiddleware } from '../middleware/auth';
import { parseExcel } from '../lib/parser-excel';
import { parseWord } from '../lib/parser-word';
import { parsePdf } from '../lib/parser-pdf';
import { readFromR2 } from '../lib/r2';
import type { Env } from '../types';

const importRoutes = new Hono<{ Bindings: Env }>();
importRoutes.use('*', authMiddleware());

// POST /api/admin/import/presign - 生成 R2 预签名上传 URL
importRoutes.post('/presign', async (c) => {
  const { filename, content_type } = await c.req.json<{
    filename: string;
    content_type: string;
  }>();
  
  // 验证文件类型
  const allowedTypes: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/pdf': 'pdf',
  };
  
  const fileType = allowedTypes[content_type];
  if (!fileType) {
    return c.json({ error: '不支持的文件格式，请上传 .xlsx / .docx / .pdf 文件' }, 400);
  }
  
  const fileId = generateId();
  const r2Key = `imports/${fileId}/${filename}`;
  
  // 存储导入记录
  await c.env.DB.prepare(
    'INSERT INTO import_files (id, file_name, file_url, file_type, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(fileId, filename, r2Key, fileType, 'uploaded').run();
  
  // 生成预签名 URL（用于前端直传 R2）
  // 在 Cloudflare 环境中，R2 支持 presigned URL
  // 这里返回上传配置，前端通过 Worker 中转上传
  return c.json({
    import_id: fileId,
    r2_key: r2Key,
    upload_url: `/api/admin/import/upload/${fileId}`,
    message: '预签名 URL 已生成',
  });
});

// POST /api/admin/import/upload/:id - 通过 Worker 中转上传文件到 R2
importRoutes.post('/upload/:id', async (c) => {
  const importId = c.req.param('id');
  
  const importFile = await c.env.DB.prepare(
    'SELECT * FROM import_files WHERE id = ?'
  ).bind(importId).first();
  
  if (!importFile) {
    return c.json({ error: '导入记录不存在' }, 404);
  }
  
  // 获取请求体（文件数据）
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  
  if (!file) {
    return c.json({ error: '未找到上传文件' }, 400);
  }
  
  // 验证文件大小（最大 10MB）
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: '文件大小不能超过 10MB' }, 400);
  }
  
  // 上传到 R2
  const buffer = await file.arrayBuffer();
  await c.env.R2.put(importFile.file_url as string, buffer, {
    httpMetadata: {
      contentType: file.type,
    },
  });
  
  return c.json({
    message: '文件上传成功',
    import_id: importId,
  });
});

// POST /api/admin/import/parse/:id - 解析已上传的文件
importRoutes.post('/parse/:id', async (c) => {
  const importId = c.req.param('id');
  
  const importFile = await c.env.DB.prepare(
    'SELECT * FROM import_files WHERE id = ?'
  ).bind(importId).first();
  
  if (!importFile) {
    return c.json({ error: '导入记录不存在' }, 404);
  }
  
  if (importFile.status === 'confirmed') {
    return c.json({ error: '该文件已确认导入，不能重复解析' }, 400);
  }
  
  // 从 R2 读取文件
  const data = await readFromR2(c.env.R2, importFile.file_url as string);
  if (!data) {
    return c.json({ error: '文件读取失败' }, 500);
  }
  
  try {
    let parsed;
    
    switch (importFile.file_type) {
      case 'xlsx':
        parsed = await parseExcel(data.buffer);
        break;
      case 'docx':
        parsed = await parseWord(data.buffer);
        break;
      case 'pdf':
        parsed = await parsePdf(data.buffer);
        break;
      default:
        return c.json({ error: '不支持的文件类型' }, 400);
    }
    
    // 更新解析结果
    await c.env.DB.prepare(
      "UPDATE import_files SET status = 'parsed', parsed_data = ? WHERE id = ?"
    ).bind(JSON.stringify(parsed.questions), importId).run();
    
    return c.json({
      import_id: importId,
      title: parsed.title,
      description: parsed.description,
      questions: parsed.questions,
      message: '文件解析成功',
    });
  } catch (error: any) {
    // 解析失败
    await c.env.DB.prepare(
      "UPDATE import_files SET status = 'failed', error_message = ? WHERE id = ?"
    ).bind(error.message, importId).run();
    
    return c.json({
      error: `文件解析失败: ${error.message}`,
      hint: '请检查文件格式是否符合规范',
    }, 400);
  }
});

export default importRoutes;
