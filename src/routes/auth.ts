import { Hono } from "hono";
import { signJwt, verifyJwt } from "../lib/jwt";
import { kvGet, kvPut, KVKeys } from "../lib/store";
import type { Env, JwtPayload, AdminUser } from "../types";

const auth = new Hono<{ Bindings: Env }>();

// 用户注册
auth.post("/register", async (c) => {
  const { username, password, display_name } = await c.req.json<{ 
    username: string; password: string; display_name: string 
  }>();
  
  if (!username || !password) return c.json({ error: "请输入用户名和密码" }, 400);
  if (username.length < 3) return c.json({ error: "用户名至少3位" }, 400);
  if (password.length < 6) return c.json({ error: "密码至少6位" }, 400);
  
  const existingUser = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(username));
  if (existingUser) return c.json({ error: "用户名已存在" }, 400);
  
  const userId = "user-" + Date.now();
  const newUser: AdminUser = {
    id: userId, username, password_hash: password, 
    display_name: display_name || username, role: "user"
  };
  
  await kvPut(c.env.KV, KVKeys.admin(username), newUser);
  
  // 将新用户加入用户索引，确保管理员用户管理页面能看到该用户
  const userIndex = await kvGet<string[]>(c.env.KV, "index:users") || [];
  if (!userIndex.includes(username)) {
    userIndex.push(username);
    await kvPut(c.env.KV, "index:users", userIndex);
  }
  
  const payload: JwtPayload = { 
    sub: userId, username, role: "user",
    iat: Math.floor(Date.now() / 1000), 
    exp: Math.floor(Date.now() / 1000) + 86400 
  };
  const token = await signJwt(payload, c.env.JWT_SECRET);
  
  return c.json({ 
    token, 
    user: { id: userId, username, display_name: newUser.display_name, role: "user" }
  });
});

// 用户登录
auth.post("/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  
  if (!username || !password) return c.json({ error: "请输入用户名和密码" }, 400);
  
  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(username));
  if (!user || user.password_hash !== password) return c.json({ error: "用户名或密码错误" }, 401);
  
  // 从 KV 获取角色，如果没有则默认为 "user"
  const role = user.role || "user";
  
  // 创建包含角色的 JWT
  const payload: JwtPayload = { 
    sub: user.id, 
    username: user.username, 
    role: role,  // 确保角色包含在 token 中
    iat: Math.floor(Date.now() / 1000), 
    exp: Math.floor(Date.now() / 1000) + 86400 
  };
  const token = await signJwt(payload, c.env.JWT_SECRET);
  
  return c.json({ 
    token, 
    user: { id: user.id, username: user.username, display_name: user.display_name, role: role }
  });
});

// 获取当前用户信息
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "未登录" }, 401);
  
  const payload = await verifyJwt(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "登录已过期" }, 401);
  
  // 从 KV 获取最新的用户信息（包括角色）
  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(payload.username));
  if (!user) return c.json({ error: "用户不存在" }, 404);
  
  return c.json({ 
    user: { 
      id: user.id, 
      username: user.username, 
      display_name: user.display_name,
      role: user.role || "user"  // 使用 KV 中的最新角色
    } 
  });
});

// 修改密码
auth.put("/change-password", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "未登录" }, 401);
  
  const payload = await verifyJwt(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "登录已过期" }, 401);
  
  const { old_password, new_password } = await c.req.json<{ old_password: string; new_password: string }>();
  
  if (!old_password || !new_password) return c.json({ error: "请输入原密码和新密码" }, 400);
  if (new_password.length < 6) return c.json({ error: "新密码至少6位" }, 400);
  
  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(payload.username));
  if (!user) return c.json({ error: "用户不存在" }, 404);
  
  if (user.password_hash !== old_password) return c.json({ error: "原密码错误" }, 400);
  
  user.password_hash = new_password;
  await kvPut(c.env.KV, KVKeys.admin(payload.username), user);
  
  return c.json({ message: "密码修改成功" });
});

export default auth;
