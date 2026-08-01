// 草稿管理路由（断点续填）
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import type { Env } from '../types';

const draft = new Hono<{ Bindings: Env }>();

// GET /api/draft/:survey_id/:user_uuid - 获取草稿
draft.get('/:survey_id/:user_uuid', async (c) => {
  const { survey_id, user_uuid } = c.req.param();
  
  const existing = await c.env.DB.prepare(
    'SELECT * FROM drafts WHERE survey_id = ? AND user_uuid = ?'
  ).bind(survey_id, user_uuid).first();
  
  if (!existing) {
    return c.json({ draft: null });
  }
  
  return c.json({
    draft: {
      ...existing,
      answers: JSON.parse(existing.answers || '{}'),
    },
  });
});

// POST /api/draft - 保存/更新草稿（防抖触发）
draft.post('/', async (c) => {
  const { survey_id, user_uuid, answers } = await c.req.json<{
    survey_id: string;
    user_uuid: string;
    answers: Record<string, any>;
  }>();
  
  if (!survey_id || !user_uuid) {
    return c.json({ error: '参数错误' }, 400);
  }
  
  // Upsert 草稿
  const existing = await c.env.DB.prepare(
    'SELECT id FROM drafts WHERE survey_id = ? AND user_uuid = ?'
  ).bind(survey_id, user_uuid).first();
  
  if (existing) {
    await c.env.DB.prepare(
      "UPDATE drafts SET answers = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(answers), existing.id).run();
  } else {
    await c.env.DB.prepare(
      'INSERT INTO drafts (id, survey_id, user_uuid, answers) VALUES (?, ?, ?, ?)'
    ).bind(generateId(), survey_id, user_uuid, JSON.stringify(answers)).run();
  }
  
  return c.json({ ok: true, message: '草稿已保存' });
});

export default draft;
