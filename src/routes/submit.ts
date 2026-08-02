import { Hono } from "hono";
import { generateId } from "../lib/uuid";
import { kvGet, kvPut, KVKeys } from "../lib/store";
import type { Env, Survey, SurveyStats } from "../types";

const submit = new Hono<{ Bindings: Env }>();

// 通过问卷ID或unique_key提交（公开接口）
submit.post("/", async (c) => {
  const { survey_id, unique_key, user_uuid, answers, duration_seconds } = await c.req.json<{
    survey_id?: string;
    unique_key?: string;
    user_uuid: string;
    answers: Record<string, any>;
    duration_seconds?: number;
  }>();
  
  if (!user_uuid || !answers) {
    return c.json({ error: "缺少必要参数" }, 400);
  }
  
  let foundSurvey: Survey | null = null;
  let ownerUsername: string | null = null;
  let surveyId: string | null = null;
  
  // 如果提供了 unique_key，通过 unique_key 索引查找
  if (unique_key) {
    const indexKey = `surveyByKey:${unique_key}`;
    const indexData = await kvGet<{ username: string; surveyId: string }>(c.env.KV, indexKey);
    
    if (indexData) {
      const surveyKey = `survey:${indexData.username}:${indexData.surveyId}`;
      const survey = await kvGet<Survey>(c.env.KV, surveyKey);
      if (survey) {
        foundSurvey = survey;
        ownerUsername = indexData.username;
        surveyId = indexData.surveyId;
      }
    }
  }
  
  // 如果通过 unique_key 没找到，尝试通过 survey_id 查找
  if (!foundSurvey && survey_id) {
    // 方法1：通过用户列表遍历查找
    const userList = await kvGet<string[]>(c.env.KV, "index:users") || [];
    for (const username of userList) {
      const surveyKey = `survey:${username}:${survey_id}`;
      const survey = await kvGet<Survey>(c.env.KV, surveyKey);
      if (survey) {
        foundSurvey = survey;
        ownerUsername = username;
        surveyId = survey_id;
        break;
      }
    }
    
    // 方法2：尝试旧的存储方式
    if (!foundSurvey) {
      const oldSurvey = await kvGet<Survey>(c.env.KV, KVKeys.survey(survey_id));
      if (oldSurvey) {
        foundSurvey = oldSurvey;
        ownerUsername = oldSurvey.created_by || "admin";
        surveyId = survey_id;
      }
    }
  }
  
  if (!foundSurvey) {
    return c.json({ error: "问卷不存在或已关闭" }, 404);
  }
  
  if (foundSurvey.status !== "active") {
    return c.json({ error: "问卷不存在或已关闭" }, 404);
  }
  
  // 创建答卷
  const responseId = generateId();
  const response = {
    id: responseId,
    survey_id: surveyId,
    user_uuid,
    answers,
    submitted_at: new Date().toISOString(),
    duration_seconds: duration_seconds || 0,
    is_flagged: false,
    flag_reasons: [],
  };
  
  // 保存答卷
  const responsesKey = `responses:${ownerUsername}:${surveyId}`;
  const responses = (await kvGet<any[]>(c.env.KV, responsesKey)) || [];
  responses.push(response);
  
  if (responses.length > 1000) {
    responses.splice(0, responses.length - 1000);
  }
  
  await kvPut(c.env.KV, responsesKey, responses);
  
  // 更新统计
  const statsKey = `stats:${ownerUsername}:${surveyId}`;
  const stats = await kvGet<SurveyStats>(c.env.KV, statsKey) || { views: 0, starts: 0, submissions: 0 };
  stats.submissions += 1;
  await kvPut(c.env.KV, statsKey, stats);
  
  return c.json({ 
    message: "提交成功", 
    response_id: responseId,
    survey_id: surveyId
  });
});

export default submit;
