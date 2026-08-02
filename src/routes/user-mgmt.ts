import { Hono } from "hono";
import { signJwt, verifyJwt } from "../lib/jwt";
import { kvGet, kvPut, kvDelete, kvListAppend, kvListRemove, KVKeys } from "../lib/store";
import { authMiddleware } from "../middleware/auth";
import type { Env, JwtPayload, AdminUser } from "../types";

const userMgmt = new Hono<{ Bindings: Env }>();
userMgmt.use("*", authMiddleware());

// 获取当前用户信息
userMgmt.get("/me", async (c) => {
  const user = c.get("admin") as AdminUser;
  return c.json({ 
    user: { 
      id: user.id, 
      username: user.username, 
      display_name: user.display_name 
    } 
  });
});

// 修改当前用户密码
userMgmt.put("/change-password", async (c) => {
  const user = c.get("admin") as AdminUser;
  const { old_password, new_password } = await c.req.json<{ old_password: string; new_password: string }>();
  
  if (!old_password || !new_password) {
    return c.json({ error: "请输入原密码和新密码" }, 400);
  }
  
  if (new_password.length < 6) {
    return c.json({ error: "新密码至少6位" }, 400);
  }
  
  // 验证原密码
  if (user.password_hash !== old_password) {
    return c.json({ error: "原密码错误" }, 400);
  }
  
  // 更新密码
  const updatedUser = { ...user, password_hash: new_password };
  await kvPut(c.env.KV, KVKeys.admin(user.username), updatedUser);
  
  return c.json({ message: "密码修改成功" });
});

// 修改当前用户信息
userMgmt.put("/profile", async (c) => {
  const user = c.get("admin") as AdminUser;
  const { display_name } = await c.req.json<{ display_name: string }>();
  
  if (!display_name) {
    return c.json({ error: "请输入显示名称" }, 400);
  }
  
  const updatedUser = { ...user, display_name };
  await kvPut(c.env.KV, KVKeys.admin(user.username), updatedUser);
  
  return c.json({ message: "信息更新成功" });
});

// ===== 管理员功能：用户管理 =====

// 获取用户列表
userMgmt.get("/list", async (c) => {
  const currentUser = c.get("admin") as AdminUser;
  
  // 获取用户列表索引
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  
  const users = [];
  for (const username of userList) {
    const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(username));
    if (user) {
      users.push({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_current_user: user.username === currentUser.username,
      });
    }
  }
  
  return c.json({ users });
});

// 创建新用户
userMgmt.post("/create", async (c) => {
  const { username, password, display_name } = await c.req.json<{ 
    username: string; 
    password: string; 
    display_name: string 
  }>();
  
  if (!username || !password) {
    return c.json({ error: "请输入用户名和密码" }, 400);
  }
  
  if (username.length < 3) {
    return c.json({ error: "用户名至少3位" }, 400);
  }
  
  if (password.length < 6) {
    return c.json({ error: "密码至少6位" }, 400);
  }
  
  // 检查用户名是否已存在
  const existingUser = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(username));
  if (existingUser) {
    return c.json({ error: "用户名已存在" }, 400);
  }
  
  // 创建用户
  const userId = "user-" + Date.now();
  const newUser: AdminUser = {
    id: userId,
    username,
    password_hash: password,
    display_name: display_name || username,
  };
  
  await kvPut(c.env.KV, KVKeys.admin(username), newUser);
  
  // 更新用户列表索引
  await kvListAppend(c.env.KV, "index:users", username);
  
  return c.json({ 
    message: "用户创建成功",
    user: { id: userId, username, display_name: newUser.display_name }
  });
});

// 修改用户信息
userMgmt.put("/update/:username", async (c) => {
  const targetUsername = c.req.param("username");
  const { display_name, password } = await c.req.json<{ display_name?: string; password?: string }>();
  
  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(targetUsername));
  if (!user) {
    return c.json({ error: "用户不存在" }, 404);
  }
  
  // 更新信息
  if (display_name) {
    user.display_name = display_name;
  }
  
  // 更新密码（如果提供）
  if (password && password.length >= 6) {
    user.password_hash = password;
  }
  
  await kvPut(c.env.KV, KVKeys.admin(targetUsername), user);
  
  return c.json({ message: "用户信息更新成功" });
});

// 删除用户
userMgmt.delete("/delete/:username", async (c) => {
  const targetUsername = c.req.param("username");
  const currentUser = c.get("admin") as AdminUser;
  
  // 不能删除自己
  if (targetUsername === currentUser.username) {
    return c.json({ error: "不能删除当前登录的用户" }, 400);
  }
  
  // 检查用户是否存在
  const user = await kvGet<AdminUser>(c.env.KV, KVKeys.admin(targetUsername));
  if (!user) {
    return c.json({ error: "用户不存在" }, 404);
  }
  
  // 删除用户
  await kvDelete(c.env.KV, KVKeys.admin(targetUsername));
  
  // 更新用户列表索引
  await kvListRemove(c.env.KV, "index:users", targetUsername);
  
  return c.json({ message: "用户删除成功" });
});

export default userMgmt;
