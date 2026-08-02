import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import importRoutes from "./routes/import";
import publicRoutes from "./routes/public";
import draftRoutes from "./routes/draft";
import submitRoutes from "./routes/submit";
import dataQualityRoutes from "./routes/data-quality";
import resetRoutes from "./routes/reset-routes";
import { kvGet, kvPut, KVKeys } from "./lib/store";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.use("*", logger());

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/admin/import", importRoutes);
app.route("/api/admin", dataQualityRoutes);
app.route("/api/reset", resetRoutes);
app.route("/api/survey", publicRoutes);
app.route("/api/draft", draftRoutes);
app.route("/api/submit", submitRoutes);

// 初始化/修复管理员账号
app.get("/api/init", async (c) => {
  // 确保 admin 账号存在且有管理员角色
  const adminUser = await kvGet(c.env.KV, KVKeys.admin("admin"));
  if (!adminUser) {
    await kvPut(c.env.KV, KVKeys.admin("admin"), { 
      id: "admin-001", 
      username: "admin", 
      password_hash: "admin123456", 
      display_name: "系统管理员",
      role: "admin"
    });
    console.log("创建 admin 管理员账号");
  } else if (adminUser.role !== "admin") {
    adminUser.role = "admin";
    await kvPut(c.env.KV, KVKeys.admin("admin"), adminUser);
    console.log("修复 admin 角色");
  }
  
  // 重建用户索引：扫描 KV 中所有 admin:* 键，确保所有注册用户都在列表中
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  const nameSet = new Set<string>(userList);
  nameSet.add("admin"); // 确保管理员始终在列表中
  try {
    const keys = await c.env.KV.list({ prefix: "admin:" });
    for (const key of keys.keys) {
      const username = key.name.slice("admin:".length);
      if (username) nameSet.add(username);
    }
  } catch (e) {
    // KV list 不可用时仅保留现有索引
  }
  const merged = Array.from(nameSet);
  if (merged.length !== userList.length || !userList.includes("admin")) {
    await kvPut(c.env.KV, "index:users", merged);
  }
  
  return c.json({ message: "系统已就绪" });
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.notFound((c) => {
  if (c.req.url.includes("/api/")) return c.json({ error: "API 路由不存在" }, 404);
  return c.text("Not Found", 404);
});

app.onError((err, c) => {
  console.error("Worker error:", err);
  return c.json({ error: "服务器内部错误" }, 500);
});

export default app;
