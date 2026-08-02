import { Hono } from "hono";
import { kvGet, kvPut, KVKeys } from "../lib/store";
import type { Env, Draft } from "../types";

const draft = new Hono<{ Bindings: Env }>();

draft.get("/:survey_id/:user_uuid", async (c) => {
  const { survey_id, user_uuid } = c.req.param();
  const existing = await kvGet<Draft>(c.env.KV, KVKeys.draft(survey_id, user_uuid));
  return c.json({ draft: existing ? { answers: existing.answers } : null });
});

draft.post("/", async (c) => {
  const { survey_id, user_uuid, answers } = await c.req.json<{ survey_id: string; user_uuid: string; answers: Record<string, any> }>();
  if (!survey_id || !user_uuid) return c.json({ error: "参数错误" }, 400);
  await kvPut(c.env.KV, KVKeys.draft(survey_id, user_uuid), { survey_id, user_uuid, answers, updated_at: new Date().toISOString() });
  return c.json({ ok: true, message: "草稿已保存" });
});

export default draft;
