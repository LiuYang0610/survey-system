// JWT 鉴权中间件
import { Context, Next } from 'hono';
import { verifyJwt } from '../lib/jwt';
import type { Env, JwtPayload } from '../types';

// 扩展 Hono Context 的变量类型
type Variables = {
  admin: JwtPayload;
};

export function authMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: '未登录，请先登录' }, 401);
    }
    
    const token = authHeader.slice(7);
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    
    if (!payload) {
      return c.json({ error: '登录已过期，请重新登录' }, 401);
    }
    
    c.set('admin', payload);
    await next();
  };
}
