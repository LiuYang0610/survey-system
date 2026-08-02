import { Hono } from "hono";
import { generateId } from "../lib/uuid";
import { authMiddleware } from "../middleware/auth";
import { kvGet, kvPut, kvDelete, KVKeys } from "../lib/store";
import type { Env, Survey } from "../types";

const admin = new Hono<{ Bindings: Env }>();
admin.use("*", authMiddleware());

function generateUniqueKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}

function isAdmin(user: any): boolean {
  return user.role === "admin";
}

// 获取问卷列表
admin.get("/surveys", async (c) => {
  const user = c.get("admin");
  let surveys: any[] = [];
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    const nameCache = new Map<string, string>();
    for (const username of userList) {
      const listKey = `surveys:${username}`;
      const allIds = (await kvGet<string[]>(c.env.KV, listKey)) || [];
      for (const id of allIds) {
        const survey = await kvGet<Survey>(c.env.KV, `survey:${username}:${id}`);
        if (survey) {
          const stats = await kvGet<any>(c.env.KV, `stats:${username}:${id}`);
          if (!nameCache.has(username)) {
            const ownerUser = await kvGet<any>(c.env.KV, KVKeys.admin(username));
            nameCache.set(username, ownerUser?.display_name || username);
          }
          surveys.push({ ...survey, views: stats?.views || 0, submissions: stats?.submissions || 0, owner: username, owner_name: nameCache.get(username) || username });
        }
      }
    }
  } else {
    const listKey = `surveys:${user.username}`;
    const allIds = (await kvGet<string[]>(c.env.KV, listKey)) || [];
    for (const id of allIds) {
      const survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${id}`);
      if (survey) {
        const stats = await kvGet<any>(c.env.KV, `stats:${user.username}:${id}`);
        surveys.push({ ...survey, views: stats?.views || 0, submissions: stats?.submissions || 0, owner: user.username, owner_name: user.display_name || user.username });
      }
    }
  }
  
  surveys.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return c.json({ surveys, total: surveys.length });
});

// 创建问卷
admin.post("/surveys", async (c) => {
  const user = c.get("admin");
  const { title, description, questions } = await c.req.json<{ title: string; description?: string; questions?: any[] }>();
  if (!title) return c.json({ error: "请输入问卷标题" }, 400);
  
  const surveyId = generateId();
  const uniqueKey = generateUniqueKey();
  const now = new Date().toISOString();
  
  const survey: Survey = {
    id: surveyId, unique_key: uniqueKey, title, description: description || "",
    status: "active", allow_resubmit: 1, created_by: user.username,
    created_at: now, updated_at: now,
    questions: (questions || []).map((q: any, idx: number) => ({
      id: generateId(), sort_order: q.sort_order || idx + 1, type: q.type || "single",
      title: q.title || "", description: q.description || "", required: q.required ? 1 : 0,
      options: q.options || [], scale_min: q.scale_min || 1, scale_max: q.scale_max || 5,
      scale_min_label: q.scale_min_label || "非常不满意", scale_max_label: q.scale_max_label || "非常满意",
    })),
  };
  
  await kvPut(c.env.KV, `survey:${user.username}:${surveyId}`, survey);
  const listKey = `surveys:${user.username}`;
  const list = (await kvGet<string[]>(c.env.KV, listKey)) || [];
  list.unshift(surveyId);
  await kvPut(c.env.KV, listKey, list);
  await kvPut(c.env.KV, `surveyByKey:${uniqueKey}`, { username: user.username, surveyId });
  await kvPut(c.env.KV, `stats:${user.username}:${surveyId}`, { views: 0, starts: 0, submissions: 0 });
  
  return c.json({ id: surveyId, unique_key: uniqueKey, message: "问卷创建成功" });
});

// 获取问卷详情
admin.get("/surveys/:id", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const survey = await kvGet<Survey>(c.env.KV, `survey:${username}:${surveyId}`);
      if (survey) return c.json(survey);
    }
  } else {
    const survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
    if (survey) return c.json(survey);
  }
  return c.json({ error: "问卷不存在" }, 404);
});

// 更新问卷
admin.put("/surveys/:id", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  const body = await c.req.json<{ title?: string; description?: string; status?: string }>();
  
  let survey: Survey | null = null;
  let ownerUsername = user.username;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const s = await kvGet<Survey>(c.env.KV, `survey:${username}:${surveyId}`);
      if (s) { survey = s; ownerUsername = username; break; }
    }
  } else {
    survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
  }
  
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  if (body.title !== undefined) survey.title = body.title;
  if (body.description !== undefined) survey.description = body.description;
  if (body.status !== undefined) survey.status = body.status as any;
  survey.updated_at = new Date().toISOString();
  
  await kvPut(c.env.KV, `survey:${ownerUsername}:${surveyId}`, survey);
  return c.json({ message: "更新成功" });
});

// 删除问卷
admin.delete("/surveys/:id", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  
  let survey: Survey | null = null;
  let ownerUsername = user.username;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const s = await kvGet<Survey>(c.env.KV, `survey:${username}:${surveyId}`);
      if (s) { survey = s; ownerUsername = username; break; }
    }
  } else {
    survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
  }
  
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  await kvDelete(c.env.KV, `survey:${ownerUsername}:${surveyId}`);
  await kvDelete(c.env.KV, `surveyByKey:${survey.unique_key}`);
  const listKey = `surveys:${ownerUsername}`;
  const list = (await kvGet<string[]>(c.env.KV, listKey)) || [];
  await kvPut(c.env.KV, listKey, list.filter(id => id !== surveyId));
  await kvDelete(c.env.KV, `stats:${ownerUsername}:${surveyId}`);
  
  return c.json({ message: "删除成功" });
});

// 更新题目
admin.put("/surveys/:id/questions", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  const { questions } = await c.req.json<{ questions: any[] }>();
  
  let survey: Survey | null = null;
  let ownerUsername = user.username;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const s = await kvGet<Survey>(c.env.KV, `survey:${username}:${surveyId}`);
      if (s) { survey = s; ownerUsername = username; break; }
    }
  } else {
    survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
  }
  
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  survey.questions = questions.map((q: any, idx: number) => ({
    id: q.id || generateId(), sort_order: q.sort_order || idx + 1, type: q.type,
    title: q.title, description: q.description || "", required: q.required ? 1 : 0,
    options: q.options || [], scale_min: q.scale_min || 1, scale_max: q.scale_max || 5,
    scale_min_label: q.scale_min_label || "非常不满意", scale_max_label: q.scale_max_label || "非常满意",
  }));
  survey.updated_at = new Date().toISOString();
  
  await kvPut(c.env.KV, `survey:${ownerUsername}:${surveyId}`, survey);
  return c.json({ message: "题目更新成功" });
});

// 获取统计
admin.get("/surveys/:id/stats", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  let ownerUsername = user.username;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const stats = await kvGet<any>(c.env.KV, `stats:${username}:${surveyId}`);
      if (stats) { ownerUsername = username; break; }
    }
  }
  
  const stats = await kvGet<any>(c.env.KV, `stats:${ownerUsername}:${surveyId}`);
  return c.json({ views: stats?.views || 0, starts: stats?.starts || 0, submissions: stats?.submissions || 0 });
});

// 获取答卷列表
admin.get("/surveys/:id/responses", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  let ownerUsername = user.username;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const stats = await kvGet<any>(c.env.KV, `stats:${username}:${surveyId}`);
      if (stats) { ownerUsername = username; break; }
    }
  }
  
  const responsesKey = `responses:${ownerUsername}:${surveyId}`;
  const allResponses = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  const total = allResponses.length;
  const responses = allResponses
    .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice((page - 1) * limit, page * limit);
  
  return c.json({ responses, total });
});

// 导出数据
admin.get("/surveys/:id/export", async (c) => {
  const user = c.get("admin");
  const surveyId = c.req.param("id");
  let ownerUsername = user.username;
  let survey: Survey | null = null;
  
  if (isAdmin(user)) {
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const s = await kvGet<Survey>(c.env.KV, `survey:${username}:${surveyId}`);
      if (s) { survey = s; ownerUsername = username; break; }
    }
  } else {
    survey = await kvGet<Survey>(c.env.KV, `survey:${user.username}:${surveyId}`);
  }
  
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  const responsesKey = `responses:${ownerUsername}:${surveyId}`;
  const responses = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  return c.json({ survey, responses });
});

// ===== 用户管理路由 =====

// 获取用户列表
admin.get("/users/list", async (c) => {
  const user = c.get("admin");
  const users = [];
  
  if (isAdmin(user)) {
    let userList = (await kvGet<string[]>(c.env.KV, "index:users")) || [];
    // 兜底：扫描 KV 中所有 admin:* 键，防止注册接口遗漏索引导致新用户不显示
    try {
      const keys = await c.env.KV.list({ prefix: "admin:" });
      const nameSet = new Set<string>(userList);
      for (const key of keys.keys) {
        const username = key.name.slice("admin:".length);
        if (username) nameSet.add(username);
      }
      const merged = Array.from(nameSet);
      if (merged.length !== userList.length) {
        await kvPut(c.env.KV, "index:users", merged);
        userList = merged;
      }
    } catch (e) {
      // KV list 不可用时忽略，继续使用索引
    }
    for (const username of userList) {
      const u = await kvGet<any>(c.env.KV, KVKeys.admin(username));
      if (u) {
        users.push({ id: u.id, username: u.username, display_name: u.display_name, role: u.role || "user" });
      }
    }
  } else {
    users.push({ id: user.id, username: user.username, display_name: user.display_name, role: user.role || "user" });
  }
  
  return c.json({ users });
});

// 创建用户
admin.post("/users/create", async (c) => {
  const { username, password, display_name } = await c.req.json<{ username: string; password: string; display_name: string }>();
  
  if (!username || !password) return c.json({ error: "请输入用户名和密码" }, 400);
  if (username.length < 3) return c.json({ error: "用户名至少3位" }, 400);
  if (password.length < 6) return c.json({ error: "密码至少6位" }, 400);
  
  const existingUser = await kvGet<any>(c.env.KV, KVKeys.admin(username));
  if (existingUser) return c.json({ error: "用户名已存在" }, 400);
  
  const userId = "user-" + Date.now();
  const newUser = { id: userId, username, password_hash: password, display_name: display_name || username, role: "user" };
  
  await kvPut(c.env.KV, KVKeys.admin(username), newUser);
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  if (!userList.includes(username)) {
    userList.push(username);
    await kvPut(c.env.KV, "index:users", userList);
  }
  
  return c.json({ message: "用户创建成功", user: { id: userId, username, display_name: newUser.display_name } });
});

// 更新用户 - admin 可以修改任何用户（包括密码）
admin.put("/users/update/:username", async (c) => {
  const currentUser = c.get("admin");
  const targetUsername = c.req.param("username");
  const { display_name, password } = await c.req.json<{ display_name?: string; password?: string }>();
  
  // admin 可以修改任何用户，普通用户只能修改自己
  if (!isAdmin(currentUser) && currentUser.username !== targetUsername) {
    return c.json({ error: "只能修改自己的信息" }, 403);
  }
  
  const user = await kvGet<any>(c.env.KV, KVKeys.admin(targetUsername));
  if (!user) return c.json({ error: "用户不存在" }, 404);
  
  if (display_name) user.display_name = display_name;
  if (password) user.password_hash = password;  // admin 可以直接设置密码，无需验证
  
  await kvPut(c.env.KV, KVKeys.admin(targetUsername), user);
  return c.json({ message: "用户更新成功" });
});

// 删除用户
admin.delete("/users/delete/:username", async (c) => {
  const currentUser = c.get("admin");
  const targetUsername = c.req.param("username");
  
  if (!isAdmin(currentUser)) {
    return c.json({ error: "只有管理员可以删除用户" }, 403);
  }
  
  const user = await kvGet<any>(c.env.KV, KVKeys.admin(targetUsername));
  if (!user) return c.json({ error: "用户不存在" }, 404);
  
  await kvDelete(c.env.KV, KVKeys.admin(targetUsername));
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  await kvPut(c.env.KV, "index:users", userList.filter(u => u !== targetUsername));
  
  return c.json({ message: "用户删除成功" });
});

export default admin;
