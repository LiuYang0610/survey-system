// ============================================
// Cloudflare Worker 主入口 (KV 版)
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import importRoutes from './routes/import';
import publicRoutes from './routes/public';
import draftRoutes from './routes/draft';
import submitRoutes from './routes/submit';
import { generateId } from './lib/uuid';
import { kvGet, kvPut, KVKeys } from './lib/store';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('*', logger());

// API 路由
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/import', importRoutes);
app.route('/api/survey', publicRoutes);
app.route('/api/draft', draftRoutes);
app.route('/api/submit', submitRoutes);

// 初始化默认管理员（首次访问时）
app.get('/api/init', async (c) => {
  const existing = await kvGet(c.env.KV, KVKeys.admin('admin'));
  if (!existing) {
    await kvPut(c.env.KV, KVKeys.admin('admin'), {
      id: 'admin-001',
      username: 'admin',
      password_hash: 'admin123456',
      display_name: '系统管理员',
    });
    return c.json({ message: '默认管理员已创建 (admin / admin123456)' });
  }
  return c.json({ message: '管理员已存在' });
});

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.notFound((c) => {
  if (c.req.url.includes('/api/')) return c.json({ error: 'API 路由不存在' }, 404);
  return c.text('Not Found', 404);
});

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: '服务器内部错误' }, 500);
});

export default app;
