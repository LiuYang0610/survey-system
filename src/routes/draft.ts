// 草稿管理路由（KV 版）
import { Hono } from 'hono';
import { kvGet, kvPut, kvDelete, KVKeys } from '../lib/store';
import type { Env, Draft } from '../types';

const draft = new Hono<{ Bindings: Env }>();

draft.get('/:survey_id/:user_uuid', async (c) => {
  const { survey_id, user_uuid } = c.req.param();
  const existing = await kvGet<Draft>(c.env.KV, KVKeys.draft(survey_id, user_uuid));
  return c.json({ draft: existing ? { answers: existing.answers } : null });
});

draft.post('/', async (c) => {
  const { survey_id, user_uuid, answers } = await c.req.json<{
    survey_id: string; user_uuid: string; answers: Record<string, any>;
  }>();
  if (!survey_id || !user_uuid) return c.json({ error: '参数错误' }, 400);

  const draftData: Draft = {
    survey_id,
    user_uuid,
    answers,
    updated_at: new Date().toISOString(),
  };
  await kvPut(c.env.KV, KVKeys.draft(survey_id, user_uuid), draftData);
  return c.json({ ok: true, message: '草稿已保存' });
});

export default draft;
