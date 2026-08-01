// 管理员认证路由（KV 版）
import { Hono } from 'hono';
import { signJwt, verifyJwt } from '../lib/jwt';
import { generateId } from '../lib/uuid';
import { kvGet, kvPut, KVKeys } from '../lib/store';
import type { Env, JwtPayload, AdminUser } from '../types';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  if (!username || !password) return c.json({ error: '请输入用户名和密码' }, 400);

  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(username));
  if (!user || user.password_hash !== password) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const token = await signJwt(payload, c.env.JWT_SECRET);

  return c.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: '未登录' }, 401);

  const payload = await verifyJwt(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload) return c.json({ error: '登录已过期' }, 401);

  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(payload.username));
  if (!user) return c.json({ error: '用户不存在' }, 404);

  return c.json({ user: { id: user.id, username: user.username, display_name: user.display_name } });
});

export default auth;
