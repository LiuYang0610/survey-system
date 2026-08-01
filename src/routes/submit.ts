// 答卷提交路由（KV 版）
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import { kvGet, kvPut, kvDelete, kvListAppend, KVKeys } from '../lib/store';
import type { Env, Survey, SurveyResponse, SurveyStats } from '../types';

const submit = new Hono<{ Bindings: Env }>();

submit.post('/', async (c) => {
  const { survey_id, user_uuid, answers } = await c.req.json<{
    survey_id: string; user_uuid: string; answers: Record<string, any>;
  }>();
  if (!survey_id || !user_uuid || !answers) return c.json({ error: '参数错误' }, 400);

  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(survey_id));
  if (!survey || survey.status !== 'active') return c.json({ error: '问卷不存在或已关闭' }, 404);

  // 检查重复提交
  if (!survey.allow_resubmit) {
    const existing = await kvGet<SurveyResponse>(c.env.KV, KVKeys.response(survey_id, user_uuid));
    if (existing) return c.json({ error: '您已经提交过答卷，不能重复提交' }, 400);
  }

  // 校验必填题
  for (const q of survey.questions) {
    if (q.required) {
      const answer = answers[q.id];
      if (answer === undefined || answer === null || answer === '') {
        return c.json({ error: `请完成第 ${q.sort_order} 题：${q.title}` }, 400);
      }
      if (q.type === 'multiple' && Array.isArray(answer) && answer.length === 0) {
        return c.json({ error: `请至少选择一个选项：${q.title}` }, 400);
      }
    }
  }

  // 保存答卷
  const response: SurveyResponse = {
    id: generateId(),
    survey_id,
    user_uuid,
    answers,
    submitted_at: new Date().toISOString(),
  };
  await kvPut(c.env.KV, KVKeys.response(survey_id, user_uuid), response);

  // 更新索引（存储答卷摘要用于列表展示）
  const indexKey = `data:responses:${survey_id}`;
  const indexData = await kvGet<any[]>(c.env.KV, indexKey) || [];
  indexData.unshift({ id: response.id, user_uuid: response.user_uuid, answers: response.answers, submitted_at: response.submitted_at });
  await kvPut(c.env.KV, indexKey, indexData);

  // 删除草稿
  await kvDelete(c.env.KV, KVKeys.draft(survey_id, user_uuid));

  // 更新统计
  const stats = await kvGet<SurveyStats>(c.env.KV, KVKeys.stats(survey_id));
  if (stats) {
    stats.submissions += 1;
    await kvPut(c.env.KV, KVKeys.stats(survey_id), stats);
  }

  return c.json({ ok: true, message: '答卷提交成功' });
});

export default submit;
