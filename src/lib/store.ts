// ============================================
// Cloudflare KV 存储工具库
// ============================================
import type { Survey, SurveyStats } from '../types';

// KV Key 生成工具
export const KVKeys = {
  // 管理员
  admin: (username: string) => `admin:${username}`,
  
  // 问卷
  survey: (id: string) => `survey:${id}`,
  surveyByKey: (uniqueKey: string) => `survey:key:${uniqueKey}`,
  
  // 索引
  surveyList: () => 'index:surveys',
  
  // 草稿
  draft: (surveyId: string, userUuid: string) => `draft:${surveyId}:${userUuid}`,
  
  // 答卷
  response: (surveyId: string, userUuid: string) => `response:${surveyId}:${userUuid}`,
  responseList: (surveyId: string) => `index:responses:${surveyId}`,
  
  // 统计
  stats: (surveyId: string) => `stats:${surveyId}`,
};

// 通用 KV 读写
export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const value = await kv.get(key, 'json');
  return value as T | null;
}

export async function kvPut(kv: KVNamespace, key: string, value: any, expirationTtl?: number): Promise<void> {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl, // 可选：设置过期时间（秒）
  });
}

export async function kvDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// 操作索引列表
export async function kvListAppend(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = await kvGet<string[]>(kv, listKey) || [];
  if (!list.includes(itemId)) {
    list.unshift(itemId); // 新的放前面
    await kvPut(kv, listKey, list);
  }
}

export async function kvListRemove(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = await kvGet<string[]>(kv, listKey) || [];
  const filtered = list.filter(id => id !== itemId);
  await kvPut(kv, listKey, filtered);
}

// 获取问卷列表（带统计信息）
export async function getSurveyList(
  kv: KVNamespace,
  page: number = 1,
  limit: number = 20,
  search: string = ''
): Promise<{ surveys: any[]; total: number }> {
  const allIds = await kvGet<string[]>(kv, KVKeys.surveyList()) || [];
  
  // 加载所有问卷（KV 无法直接分页，需要全量加载后过滤）
  let surveys: any[] = [];
  for (const id of allIds) {
    const survey = await kvGet<Survey>(kv, KVKeys.survey(id));
    if (survey) {
      // 搜索过滤
      if (search && !survey.title.includes(search)) continue;
      
      // 获取统计
      const stats = await kvGet<SurveyStats>(kv, KVKeys.stats(survey.id));
      
      surveys.push({
        ...survey,
        views: stats?.views || 0,
        submissions: stats?.submissions || 0,
      });
    }
  }
  
  // 按创建时间倒序
  surveys.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  const total = surveys.length;
  const start = (page - 1) * limit;
  surveys = surveys.slice(start, start + limit);
  
  return { surveys, total };
}

// 获取答卷列表
export async function getResponseList(
  kv: KVNamespace,
  surveyId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ responses: any[]; total: number }> {
  const allIds = await kvGet<string[]>(kv, KVKeys.responseList(surveyId)) || [];
  
  let responses: any[] = [];
  for (const id of allIds) {
    const key = `response:${surveyId}:`;
    // 遍历所有可能的 user_uuid 组合太低效，改用直接存储ID列表
    // 实际上我们存储的是 survey_id:user_uuid 作为key的一部分
  }
  
  // 简化：直接从索引中获取所有答卷key，然后批量读取
  // 但 KV 没有批量读取，所以我们用不同的策略：
  // 在存储答卷时，同时在索引中存储完整数据（或部分数据）
  
  // 改用存储完整答卷数据到索引
  const indexData = await kvGet<any[]>(kv, `data:responses:${surveyId}`) || [];
  
  // 时间筛选和排序
  let filtered = indexData.sort((a: any, b: any) => 
    new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );
  
  const total = filtered.length;
  const start = (page - 1) * limit;
  filtered = filtered.slice(start, start + limit);
  
  return { responses: filtered, total };
}
