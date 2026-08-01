// 前台公开访问路由
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import type { Env } from '../types';

const publicRoutes = new Hono<{ Bindings: Env }>();

// GET /api/survey/:unique_key - 获取问卷数据（公开访问）
publicRoutes.get('/:unique_key', async (c) => {
  const uniqueKey = c.req.param('unique_key');
  
  // 获取问卷
  const survey = await c.env.DB.prepare(
    'SELECT * FROM surveys WHERE unique_key = ? AND status = ?'
  ).bind(uniqueKey, 'active').first();
  
  if (!survey) {
    return c.json({ error: '问卷不存在或已关闭' }, 404);
  }
  
  // 获取题目
  const questions = await c.env.DB.prepare(
    'SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order'
  ).bind(survey.id).all();
  
  // 记录访问日志
  const userUuid = c.req.header('X-User-Uuid') || null;
  await c.env.DB.prepare(
    'INSERT INTO visit_logs (survey_id, user_uuid, event_type) VALUES (?, ?, ?)'
  ).bind(survey.id, userUuid, 'view').run();
  
  return c.json({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    questions: questions.results.map((q: any) => ({
      id: q.id,
      sort_order: q.sort_order,
      type: q.type,
      title: q.title,
      description: q.description,
      required: q.required,
      options: JSON.parse(q.options || '[]'),
      scale_min: q.scale_min,
      scale_max: q.scale_max,
      scale_min_label: q.scale_min_label,
      scale_max_label: q.scale_max_label,
    })),
  });
});

// POST /api/survey/:unique_key/visit - 记录开始填写
publicRoutes.post('/:unique_key/visit', async (c) => {
  const uniqueKey = c.req.param('unique_key');
  const { event_type, user_uuid } = await c.req.json<{
    event_type: 'start';
    user_uuid: string;
  }>();
  
  const survey = await c.env.DB.prepare(
    'SELECT id FROM surveys WHERE unique_key = ?'
  ).bind(uniqueKey).first();
  
  if (!survey) {
    return c.json({ error: '问卷不存在' }, 404);
  }
  
  await c.env.DB.prepare(
    'INSERT INTO visit_logs (survey_id, user_uuid, event_type) VALUES (?, ?, ?)'
  ).bind(survey.id, user_uuid, event_type).run();
  
  return c.json({ ok: true });
});

export default publicRoutes;
