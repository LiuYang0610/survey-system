// 后台管理路由（KV 版）
import { Hono } from 'hono';
import { generateId, generateUniqueKey } from '../lib/uuid';
import { authMiddleware } from '../middleware/auth';
import { kvGet, kvPut, kvDelete, kvListAppend, kvListRemove, KVKeys, getSurveyList, getResponseList } from '../lib/store';
import type { Env, Survey, Question, SurveyStats, SurveyResponse } from '../types';

const admin = new Hono<{ Bindings: Env }>();
admin.use('*', authMiddleware());

// 获取问卷列表
admin.get('/surveys', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search') || '';
  
  const result = await getSurveyList(c.env.KV, page, limit, search);
  return c.json(result);
});

// 创建问卷
admin.post('/surveys', async (c) => {
  const { title, description, questions } = await c.req.json<{
    title: string; description?: string; questions?: any[];
  }>();
  if (!title) return c.json({ error: '请输入问卷标题' }, 400);

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
    questions: (questions || []).map((q: any, idx: number) => ({
      id: generateId(),
      sort_order: q.sort_order || idx + 1,
      type: q.type || 'single',
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
  
  // 初始化统计
  await kvPut(c.env.KV, KVKeys.stats(surveyId), { views: 0, starts: 0, submissions: 0 });

  return c.json({ id: surveyId, unique_key: uniqueKey, message: '问卷创建成功' });
});

// 获取问卷详情
admin.get('/surveys/:id', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);
  return c.json(survey);
});

// 更新问卷
admin.put('/surveys/:id', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);

  const body = await c.req.json<{ title?: string; description?: string; status?: string; allow_resubmit?: number }>();
  if (body.title !== undefined) survey.title = body.title;
  if (body.description !== undefined) survey.description = body.description;
  if (body.status !== undefined) survey.status = body.status as any;
  if (body.allow_resubmit !== undefined) survey.allow_resubmit = body.allow_resubmit;
  survey.updated_at = new Date().toISOString();

  await kvPut(c.env.KV, KVKeys.survey(survey.id), survey);
  return c.json({ message: '更新成功' });
});

// 删除问卷
admin.delete('/surveys/:id', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);

  await kvDelete(c.env.KV, KVKeys.survey(survey.id));
  await kvDelete(c.env.KV, KVKeys.surveyByKey(survey.unique_key));
  await kvDelete(c.env.KV, KVKeys.stats(survey.id));
  await kvListRemove(c.env.KV, KVKeys.surveyList(), survey.id);
  await kvDelete(c.env.KV, KVKeys.responseList(survey.id));

  return c.json({ message: '删除成功' });
});

// 批量更新题目
admin.put('/surveys/:id/questions', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);

  const { questions } = await c.req.json<{ questions: any[] }>();
  survey.questions = questions.map((q: any, idx: number) => ({
    id: q.id || generateId(),
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
  }));
  survey.updated_at = new Date().toISOString();

  await kvPut(c.env.KV, KVKeys.survey(survey.id), survey);
  return c.json({ message: '题目更新成功' });
});

// 问卷统计
admin.get('/surveys/:id/stats', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);

  const stats = await kvGet<SurveyStats>(c.env.KV, KVKeys.stats(survey.id));
  const views = stats?.views || 0;
  const submissions = stats?.submissions || 0;

  return c.json({
    total_views: views,
    total_starts: stats?.starts || 0,
    total_submissions: submissions,
    completion_rate: views > 0 ? Math.round((submissions / views) * 100) : 0,
    status: survey.status,
    created_at: survey.created_at,
  });
});

// 答卷列表
admin.get('/surveys/:id/responses', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const result = await getResponseList(c.env.KV, c.req.param('id'), page, limit);
  return c.json(result);
});

// 导出数据
admin.get('/surveys/:id/export', async (c) => {
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(c.req.param('id')));
  if (!survey) return c.json({ error: '问卷不存在' }, 404);

  const result = await getResponseList(c.env.KV, survey.id, 1, 99999);
  return c.json({ survey, questions: survey.questions, responses: result.responses });
});

export default admin;
