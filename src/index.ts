// ============================================
// Cloudflare Worker 主入口 (Hono)
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

const app = new Hono<{ Bindings: Env }>();

// 全局中间件
app.use('*', cors());
app.use('*', logger());

// ============================================
// API 路由
// ============================================

// 认证相关
app.route('/api/auth', authRoutes);

// 管理后台（需要鉴权）
app.route('/api/admin', adminRoutes);

// 文件导入（需要鉴权）
app.route('/api/admin/import', importRoutes);

// 公开访问（无需鉴权）
app.route('/api/survey', publicRoutes);

// 草稿管理（无需鉴权，通过 user_uuid 隔离）
app.route('/api/draft', draftRoutes);

// 答卷提交（无需鉴权）
app.route('/api/submit', submitRoutes);

// ============================================
// 静态文件服务（Cloudflare Pages 部署时由 Pages 处理）
// Worker 独立部署时的 fallback
// ============================================

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 处理
app.notFound((c) => {
  // 如果是 API 请求，返回 JSON 错误
  if (c.req.url.includes('/api/')) {
    return c.json({ error: 'API 路由不存在' }, 404);
  }
  // 否则返回前端 SPA 的 index.html（由 Pages 处理）
  return c.text('Not Found', 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: '服务器内部错误' }, 500);
});

export default app;
