import { Hono } from "hono";
import { kvGet, kvPut, KVKeys } from "../lib/store";
import type { Env, Survey, SurveyStats } from "../types";

const publicRoutes = new Hono<{ Bindings: Env }>();

// 获取问卷
publicRoutes.get("/:unique_key", async (c) => {
  const uniqueKey = c.req.param("unique_key");
  
  // 方法1：通过 unique_key 索引查找
  const indexKey = `surveyByKey:${uniqueKey}`;
  const indexData = await kvGet<{ username: string; surveyId: string }>(c.env.KV, indexKey);
  
  if (indexData) {
    const surveyKey = `survey:${indexData.username}:${indexData.surveyId}`;
    const survey = await kvGet<Survey>(c.env.KV, surveyKey);
    
    if (survey && survey.status === "active") {
      const statsKey = `stats:${indexData.username}:${indexData.surveyId}`;
      const stats = await kvGet<SurveyStats>(c.env.KV, statsKey);
      if (stats) {
        stats.views += 1;
        await kvPut(c.env.KV, statsKey, stats);
      }
      // 返回包含 unique_key 的数据
      return c.json({
        id: survey.id,
        unique_key: survey.unique_key,
        title: survey.title,
        description: survey.description,
        status: survey.status,
        questions: survey.questions,
      });
    }
  }
  
  // 方法2：遍历所有用户的问卷查找
  const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
  for (const username of userList) {
    const userSurveyList = await kvGet<string[]>(c.env.KV, `surveys:${username}`) || [];
    for (const surveyId of userSurveyList) {
      const surveyKey = `survey:${username}:${surveyId}`;
      const survey = await kvGet<Survey>(c.env.KV, surveyKey);
      if (survey && survey.unique_key === uniqueKey && survey.status === "active") {
        const statsKey = `stats:${username}:${surveyId}`;
        const stats = await kvGet<SurveyStats>(c.env.KV, statsKey);
        if (stats) {
          stats.views += 1;
          await kvPut(c.env.KV, statsKey, stats);
        }
        return c.json({
          id: survey.id,
          unique_key: survey.unique_key,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          questions: survey.questions,
        });
      }
    }
  }
  
  // 方法3：尝试旧的存储方式
  const oldSurveyId = await kvGet<string>(c.env.KV, KVKeys.surveyByKey(uniqueKey));
  if (oldSurveyId) {
    const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(oldSurveyId));
    if (survey && survey.status === "active") {
      const stats = await kvGet<SurveyStats>(c.env.KV, KVKeys.stats(survey.id));
      if (stats) {
        stats.views += 1;
        await kvPut(c.env.KV, KVKeys.stats(survey.id), stats);
      }
      return c.json({
        id: survey.id,
        unique_key: survey.unique_key,
        title: survey.title,
        description: survey.description,
        status: survey.status,
        questions: survey.questions,
      });
    }
  }
  
  return c.json({ error: "问卷不存在或已关闭" }, 404);
});

// 记录访问
publicRoutes.post("/:unique_key/visit", async (c) => {
  const uniqueKey = c.req.param("unique_key");
  const { event_type } = await c.req.json<{ event_type: string }>();
  
  // 通过索引查找
  const indexKey = `surveyByKey:${uniqueKey}`;
  const indexData = await kvGet<{ username: string; surveyId: string }>(c.env.KV, indexKey);
  
  if (indexData) {
    const statsKey = `stats:${indexData.username}:${indexData.surveyId}`;
    const stats = await kvGet<SurveyStats>(c.env.KV, statsKey);
    if (stats) {
      if (event_type === "start") stats.starts += 1;
      if (event_type === "submit") stats.submissions += 1;
      await kvPut(c.env.KV, statsKey, stats);
    }
    return c.json({ ok: true });
  }
  
  return c.json({ ok: true });
});

export default publicRoutes;
