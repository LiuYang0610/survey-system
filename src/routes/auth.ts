// 管理员认证路由
import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';
import { generateId } from '../lib/uuid';
import type { Env, JwtPayload } from '../types';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/login - 管理员登录
auth.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  
  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }
  
  // 查询用户
  const user = await c.env.DB.prepare(
    'SELECT * FROM admin_users WHERE username = ?'
  ).bind(username).first();
  
  if (!user) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  
  // 验证密码（简化版：在生产环境中应使用 bcrypt）
  // 这里用简单的字符串比较作为演示
  // 实际项目中应使用 Cloudflare Workers 兼容的密码哈希库
  if (user.password_hash !== password) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  
  // 签发 JWT
  const payload: JwtPayload = {
    sub: user.id as string,
    username: user.username as string,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24小时过期
  };
  
  const token = await signJwt(payload, c.env.JWT_SECRET);
  
  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
    },
  });
});

// POST /api/auth/register - 初始化管理员（仅首次使用）
auth.post('/register', async (c) => {
  // 检查是否已有管理员
  const existing = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM admin_users'
  ).first();
  
  if (existing && (existing.count as number) > 0) {
    return c.json({ error: '管理员已存在，不能重复注册' }, 403);
  }
  
  const { username, password, display_name } = await c.req.json<{
    username: string;
    password: string;
    display_name?: string;
  }>();
  
  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }
  
  if (password.length < 6) {
    return c.json({ error: '密码至少6位' }, 400);
  }
  
  const id = generateId();
  
  await c.env.DB.prepare(
    'INSERT INTO admin_users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
  ).bind(id, username, password, display_name || username).run();
  
  return c.json({ message: '管理员注册成功', id });
});

// GET /api/auth/me - 获取当前用户信息
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  
  const { verifyJwt } = await import('../lib/jwt');
  const payload = await verifyJwt(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: '登录已过期' }, 401);
  }
  
  const user = await c.env.DB.prepare(
    'SELECT id, username, display_name FROM admin_users WHERE id = ?'
  ).bind(payload.sub).first();
  
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  
  return c.json({ user });
});

export default auth;
