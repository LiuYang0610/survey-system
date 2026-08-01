// 后台管理路由
import { Hono } from 'hono';
import { generateId, generateUniqueKey } from '../lib/uuid';
import { authMiddleware } from '../middleware/auth';
import type { Env } from '../types';

const admin = new Hono<{ Bindings: Env }>();
admin.use('*', authMiddleware());

// GET /api/admin/surveys - 获取问卷列表
admin.get('/surveys', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search') || '';
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM surveys';
  let countQuery = 'SELECT COUNT(*) as total FROM surveys';
  const params: any[] = [];
  
  if (search) {
    const where = ' WHERE title LIKE ?';
    query += where;
    countQuery += where;
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  const [surveys, total] = await Promise.all([
    c.env.DB.prepare(query).bind(...params, limit, offset).all(),
    c.env.DB.prepare(countQuery).bind(...params).first(),
  ]);
  
  // 为每个问卷获取统计信息
  const enrichedSurveys = await Promise.all(
    surveys.results.map(async (survey: any) => {
      const [views, submissions] = await Promise.all([
        c.env.DB.prepare(
          "SELECT COUNT(*) as count FROM visit_logs WHERE survey_id = ? AND event_type = 'view'"
        ).bind(survey.id).first(),
        c.env.DB.prepare(
          "SELECT COUNT(*) as count FROM responses WHERE survey_id = ?"
        ).bind(survey.id).first(),
      ]);
      
      return {
        ...survey,
        views: views?.count || 0,
        submissions: submissions?.count || 0,
      };
    })
  );
  
  return c.json({
    surveys: enrichedSurveys,
    total: total?.total || 0,
    page,
    limit,
  });
});

// POST /api/admin/surveys - 创建问卷
admin.post('/surveys', async (c) => {
  const { title, description, questions } = await c.req.json<{
    title: string;
    description?: string;
    questions?: any[];
  }>();
  
  if (!title) {
    return c.json({ error: '请输入问卷标题' }, 400);
  }
  
  const surveyId = generateId();
  const uniqueKey = generateUniqueKey();
  
  await c.env.DB.prepare(
    'INSERT INTO surveys (id, unique_key, title, description, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(surveyId, uniqueKey, title, description || '', c.get('admin').sub).run();
  
  // 如果提供了题目，批量插入
  if (questions && questions.length > 0) {
    const stmt = c.env.DB.prepare(
      'INSERT INTO questions (id, survey_id, sort_order, type, title, description, required, options, scale_min, scale_max, scale_min_label, scale_max_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const batch = questions.map((q: any, idx: number) =>
      stmt.bind(
        generateId(),
        surveyId,
        q.sort_order || idx + 1,
        q.type || 'single',
        q.title,
        q.description || '',
        q.required ? 1 : 0,
        JSON.stringify(q.options || []),
        q.scale_min || 1,
        q.scale_max || 5,
        q.scale_min_label || '非常不满意',
        q.scale_max_label || '非常满意'
      )
    );
    
    await c.env.DB.batch(batch);
  }
  
  return c.json({
    id: surveyId,
    unique_key: uniqueKey,
    message: '问卷创建成功',
  });
});

// GET /api/admin/surveys/:id - 获取问卷详情（含题目）
admin.get('/surveys/:id', async (c) => {
  const id = c.req.param('id');
  
  const [survey, questions] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order').bind(id).all(),
  ]);
  
  if (!survey) {
    return c.json({ error: '问卷不存在' }, 404);
  }
  
  return c.json({
    ...survey,
    questions: questions.results.map((q: any) => ({
      ...q,
      options: JSON.parse(q.options || '[]'),
    })),
  });
});

// PUT /api/admin/surveys/:id - 更新问卷
admin.put('/surveys/:id', async (c) => {
  const id = c.req.param('id');
  const { title, description, status, allow_resubmit } = await c.req.json<{
    title?: string;
    description?: string;
    status?: string;
    allow_resubmit?: number;
  }>();
  
  const existing = await c.env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ error: '问卷不存在' }, 404);
  }
  
  const updates: string[] = [];
  const params: any[] = [];
  
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (allow_resubmit !== undefined) { updates.push('allow_resubmit = ?'); params.push(allow_resubmit); }
  
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE surveys SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  }
  
  return c.json({ message: '更新成功' });
});

// DELETE /api/admin/surveys/:id - 删除问卷
admin.delete('/surveys/:id', async (c) => {
  const id = c.req.param('id');
  
  await c.env.DB.prepare('DELETE FROM visit_logs WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM responses WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM drafts WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM questions WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run();
  
  return c.json({ message: '删除成功' });
});

// PUT /api/admin/surveys/:id/questions - 批量更新题目
admin.put('/surveys/:id/questions', async (c) => {
  const surveyId = c.req.param('id');
  const { questions } = await c.req.json<{ questions: any[] }>();
  
  // 删除旧题目
  await c.env.DB.prepare('DELETE FROM questions WHERE survey_id = ?').bind(surveyId).run();
  
  // 插入新题目
  if (questions.length > 0) {
    const stmt = c.env.DB.prepare(
      'INSERT INTO questions (id, survey_id, sort_order, type, title, description, required, options, scale_min, scale_max, scale_min_label, scale_max_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const batch = questions.map((q: any, idx: number) =>
      stmt.bind(
        q.id || generateId(),
        surveyId,
        q.sort_order || idx + 1,
        q.type,
        q.title,
        q.description || '',
        q.required ? 1 : 0,
        JSON.stringify(q.options || []),
        q.scale_min || 1,
        q.scale_max || 5,
        q.scale_min_label || '非常不满意',
        q.scale_max_label || '非常满意'
      )
    );
    
    await c.env.DB.batch(batch);
  }
  
  return c.json({ message: '题目更新成功' });
});

// GET /api/admin/surveys/:id/stats - 获取问卷统计
admin.get('/surveys/:id/stats', async (c) => {
  const surveyId = c.req.param('id');
  
  const [views, starts, submissions, survey] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM visit_logs WHERE survey_id = ? AND event_type = 'view'"
    ).bind(surveyId).first(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM visit_logs WHERE survey_id = ? AND event_type = 'start'"
    ).bind(surveyId).first(),
    c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM responses WHERE survey_id = ?'
    ).bind(surveyId).first(),
    c.env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(surveyId).first(),
  ]);
  
  const totalViews = (views?.count as number) || 0;
  const totalSubmissions = (submissions?.count as number) || 0;
  const completionRate = totalViews > 0 ? Math.round((totalSubmissions / totalViews) * 100) : 0;
  
  return c.json({
    total_views: totalViews,
    total_starts: (starts?.count as number) || 0,
    total_submissions: totalSubmissions,
    completion_rate: completionRate,
    status: survey?.status,
    created_at: survey?.created_at,
  });
});

// GET /api/admin/surveys/:id/responses - 获取答卷列表
admin.get('/surveys/:id/responses', async (c) => {
  const surveyId = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;
  const startDate = c.req.query('start_date');
  const endDate = c.req.query('end_date');
  
  let query = 'SELECT * FROM responses WHERE survey_id = ?';
  let countQuery = 'SELECT COUNT(*) as total FROM responses WHERE survey_id = ?';
  const params: any[] = [surveyId];
  const countParams: any[] = [surveyId];
  
  if (startDate) {
    const dateClause = ' AND submitted_at >= ?';
    query += dateClause;
    countQuery += dateClause;
    params.push(startDate);
    countParams.push(startDate);
  }
  if (endDate) {
    const dateClause = ' AND submitted_at <= ?';
    query += dateClause;
    countQuery += dateClause;
    params.push(endDate);
    countParams.push(endDate);
  }
  
  query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
  
  const [responses, total] = await Promise.all([
    c.env.DB.prepare(query).bind(...params, limit, offset).all(),
    c.env.DB.prepare(countQuery).bind(...countParams).first(),
  ]);
  
  return c.json({
    responses: responses.results.map((r: any) => ({
      ...r,
      answers: JSON.parse(r.answers || '{}'),
    })),
    total: total?.total || 0,
    page,
    limit,
  });
});

// GET /api/admin/surveys/:id/export - 导出答卷为 Excel 数据
admin.get('/surveys/:id/export', async (c) => {
  const surveyId = c.req.param('id');
  
  // 获取问卷和题目
  const [survey, questionsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(surveyId).first(),
    c.env.DB.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order').bind(surveyId).all(),
  ]);
  
  if (!survey) {
    return c.json({ error: '问卷不存在' }, 404);
  }
  
  // 获取所有答卷
  const responses = await c.env.DB.prepare(
    'SELECT * FROM responses WHERE survey_id = ? ORDER BY submitted_at'
  ).bind(surveyId).all();
  
  const questions = questionsRes.results.map((q: any) => ({
    ...q,
    options: JSON.parse(q.options || '[]'),
  }));
  
  // 构建导出数据
  const exportData = {
    survey,
    questions,
    responses: responses.results.map((r: any) => ({
      ...r,
      answers: JSON.parse(r.answers || '{}'),
    })),
  };
  
  return c.json(exportData);
});

// GET /api/admin/import/:id - 获取导入文件详情
admin.get('/import/:id', async (c) => {
  const id = c.req.param('id');
  const file = await c.env.DB.prepare('SELECT * FROM import_files WHERE id = ?').bind(id).first();
  
  if (!file) {
    return c.json({ error: '导入文件不存在' }, 404);
  }
  
  return c.json({
    ...file,
    parsed_data: JSON.parse(file.parsed_data || '[]'),
  });
});

// POST /api/admin/import/confirm - 确认导入并创建问卷
admin.post('/import/confirm', async (c) => {
  const { import_id, title, description, questions } = await c.req.json<{
    import_id: string;
    title: string;
    description?: string;
    questions: any[];
  }>();
  
  if (!title || !questions || questions.length === 0) {
    return c.json({ error: '请提供问卷标题和题目' }, 400);
  }
  
  // 创建问卷
  const surveyId = generateId();
  const uniqueKey = generateUniqueKey();
  
  await c.env.DB.prepare(
    'INSERT INTO surveys (id, unique_key, title, description, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(surveyId, uniqueKey, title, description || '', c.get('admin').sub).run();
  
  // 批量插入题目
  const stmt = c.env.DB.prepare(
    'INSERT INTO questions (id, survey_id, sort_order, type, title, description, required, options, scale_min, scale_max, scale_min_label, scale_max_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  
  const batch = questions.map((q: any, idx: number) =>
    stmt.bind(
      generateId(),
      surveyId,
      q.sort_order || idx + 1,
      q.type,
      q.title,
      q.description || '',
      q.required ? 1 : 0,
      JSON.stringify(q.options || []),
      q.scale_min || 1,
      q.scale_max || 5,
      q.scale_min_label || '非常不满意',
      q.scale_max_label || '非常满意'
    )
  );
  
  await c.env.DB.batch(batch);
  
  // 更新导入文件状态
  if (import_id) {
    await c.env.DB.prepare(
      "UPDATE import_files SET status = 'confirmed', survey_id = ? WHERE id = ?"
    ).bind(surveyId, import_id).run();
  }
  
  return c.json({
    survey_id: surveyId,
    unique_key: uniqueKey,
    message: '问卷导入成功',
  });
});

export default admin;
