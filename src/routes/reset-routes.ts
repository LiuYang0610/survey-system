import { Hono } from "hono";
import { kvGet, kvPut, kvDelete, KVKeys } from "../lib/store";
import type { Env } from "../types";

const resetRoutes = new Hono<{ Bindings: Env }>();

// 重置系统 - 删除所有用户和数据
resetRoutes.post("/reset", async (c) => {
  const { admin_password } = await c.req.json<{ admin_password: string }>();
  
  // 验证管理员密码
  if (admin_password !== "wind99") {
    return c.json({ error: "管理员密码错误" }, 401);
  }
  
  try {
    // 1. 获取所有用户列表
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    
    // 2. 删除所有用户数据
    for (const username of userList) {
      // 删除用户账户
      await kvDelete(c.env.KV, `user:${username}`);
      await kvDelete(c.env.KV, KVKeys.admin(username));
      
      // 删除用户的问卷
      const surveyList = await kvGet<string[]>(c.env.KV, `surveys:${username}`) || [];
      for (const surveyId of surveyList) {
        await kvDelete(c.env.KV, `survey:${username}:${surveyId}`);
        await kvDelete(c.env.KV, `stats:${username}:${surveyId}`);
        await kvDelete(c.env.KV, `responses:${username}:${surveyId}`);
      }
      await kvDelete(c.env.KV, `surveys:${username}`);
    }
    
    // 3. 清空用户列表索引
    await kvDelete(c.env.KV, "index:users");
    
    // 4. 重新创建管理员账号 (Wind / wind99)
    await kvPut(c.env.KV, KVKeys.admin("Wind"), { 
      id: "admin-001", 
      username: "Wind", 
      password_hash: "wind99", 
      display_name: "系统管理员",
      role: "admin"
    });
    
    // 5. 更新用户列表索引
    await kvPut(c.env.KV, "index:users", ["Wind"]);
    
    return c.json({ 
      message: "系统已重置，管理员账号已恢复 (Wind / wind99)",
      deleted_users: userList.length
    });
  } catch (err: any) {
    return c.json({ error: "重置失败: " + err.message }, 500);
  }
});

// 获取系统状态
resetRoutes.get("/status", async (c) => {
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  const userCount = userList.length;
  
  // 统计问卷数量
  let surveyCount = 0;
  for (const username of userList) {
    const surveyList = await kvGet<string[]>(c.env.KV, `surveys:${username}`) || [];
    surveyCount += surveyList.length;
  }
  
  return c.json({ 
    user_count: userCount,
    survey_count: surveyCount,
    users: userList
  });
});

export default resetRoutes;
