// 前台公开访问路由（KV 版）
import { Hono } from 'hono';
import { kvGet, kvPut, KVKeys } from '../lib/store';
import type { Env, Survey, SurveyStats } from '../types';

const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get('/:unique_key', async (c) => {
  const uniqueKey = c.req.param('unique_key');
  const surveyId = await kvGet<string>(c.env.KV, KVKeys.surveyByKey(uniqueKey));
  if (!surveyId) return c.json({ error: '问卷不存在或已关闭' }, 404);

  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  if (!survey || survey.status !== 'active') return c.json({ error: '问卷不存在或已关闭' }, 404);

  // 记录访问
  const stats = await kvGet<SurveyStats>(c.env.KV, KVKeys.stats(survey.id));
  if (stats) {
    stats.views += 1;
    await kvPut(c.env.KV, KVKeys.stats(survey.id), stats);
  }

  return c.json({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    questions: survey.questions,
  });
});

publicRoutes.post('/:unique_key/visit', async (c) => {
  const uniqueKey = c.req.param('unique_key');
  const { event_type } = await c.req.json<{ event_type: string }>();

  const surveyId = await kvGet<string>(c.env.KV, KVKeys.surveyByKey(uniqueKey));
  if (!surveyId) return c.json({ error: '问卷不存在' }, 404);

  const stats = await kvGet<SurveyStats>(c.env.KV, KVKeys.stats(surveyId));
  if (stats) {
    if (event_type === 'start') stats.starts += 1;
    if (event_type === 'submit') stats.submissions += 1;
    await kvPut(c.env.KV, KVKeys.stats(surveyId), stats);
  }

  return c.json({ ok: true });
});

export default publicRoutes;
