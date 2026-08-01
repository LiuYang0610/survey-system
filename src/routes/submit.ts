// 答卷提交路由
import { Hono } from 'hono';
import { generateId } from '../lib/uuid';
import type { Env } from '../types';

const submit = new Hono<{ Bindings: Env }>();

// POST /api/submit - 提交答卷
submit.post('/', async (c) => {
  const { survey_id, user_uuid, answers } = await c.req.json<{
    survey_id: string;
    user_uuid: string;
    answers: Record<string, any>;
  }>();
  
  if (!survey_id || !user_uuid || !answers) {
    return c.json({ error: '参数错误' }, 400);
  }
  
  // 检查问卷是否存在且开放
  const survey = await c.env.DB.prepare(
    'SELECT * FROM surveys WHERE id = ? AND status = ?'
  ).bind(survey_id, 'active').first();
  
  if (!survey) {
    return c.json({ error: '问卷不存在或已关闭' }, 404);
  }
  
  // 检查是否已提交（不允许重复提交）
  if (!survey.allow_resubmit) {
    const existingResponse = await c.env.DB.prepare(
      'SELECT id FROM responses WHERE survey_id = ? AND user_uuid = ?'
    ).bind(survey_id, user_uuid).first();
    
    if (existingResponse) {
      return c.json({ error: '您已经提交过答卷，不能重复提交' }, 400);
    }
  }
  
  // 获取题目信息进行校验
  const questions = await c.env.DB.prepare(
    'SELECT * FROM questions WHERE survey_id = ?'
  ).bind(survey_id).all();
  
  // 校验必填题
  for (const q of questions.results) {
    if ((q as any).required) {
      const answer = answers[(q as any).id];
      if (answer === undefined || answer === null || answer === '') {
        return c.json({ error: `请完成第 ${(q as any).sort_order} 题：${(q as any).title}` }, 400);
      }
      // 多选题至少选一个
      if ((q as any).type === 'multiple' && Array.isArray(answer) && answer.length === 0) {
        return c.json({ error: `请至少选择一个选项：${(q as any).title}` }, 400);
      }
    }
  }
  
  // 提交答卷
  await c.env.DB.prepare(
    'INSERT INTO responses (id, survey_id, user_uuid, answers, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    generateId(),
    survey_id,
    user_uuid,
    JSON.stringify(answers),
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('User-Agent') || null
  ).run();
  
  // 删除对应草稿
  await c.env.DB.prepare(
    'DELETE FROM drafts WHERE survey_id = ? AND user_uuid = ?'
  ).bind(survey_id, user_uuid).run();
  
  // 记录提交日志
  await c.env.DB.prepare(
    'INSERT INTO visit_logs (survey_id, user_uuid, event_type) VALUES (?, ?, ?)'
  ).bind(survey_id, user_uuid, 'submit').run();
  
  return c.json({
    ok: true,
    message: '答卷提交成功',
  });
});

export default submit;
