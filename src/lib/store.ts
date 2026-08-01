import type { Survey, SurveyStats } from '../types';

export const KVKeys = {
  admin: (username: string) => dmin:,
  survey: (id: string) => survey:,
  surveyByKey: (uniqueKey: string) => survey:key:,
  surveyList: () => 'index:surveys',
  draft: (surveyId: string, userUuid: string) => draft::,
  response: (surveyId: string, userUuid: string) => esponse::,
  stats: (surveyId: string) => stats:,
};

export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const value = await kv.get(key, 'json');
  return value as T | null;
}

export async function kvPut(kv: KVNamespace, key: string, value: any): Promise<void> {
  await kv.put(key, JSON.stringify(value));
}

export async function kvDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

export async function kvListAppend(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = await kvGet<string[]>(kv, listKey) || [];
  if (!list.includes(itemId)) {
    list.unshift(itemId);
    await kvPut(kv, listKey, list);
  }
}

export async function kvListRemove(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = await kvGet<string[]>(kv, listKey) || [];
  await kvPut(kv, listKey, list.filter(id => id !== itemId));
}

export async function getSurveyList(kv: KVNamespace, page = 1, limit = 20, search = '') {
  const allIds = await kvGet<string[]>(kv, KVKeys.surveyList()) || [];
  let surveys: any[] = [];
  for (const id of allIds) {
    const survey = await kvGet<Survey>(kv, KVKeys.survey(id));
    if (survey && (!search || survey.title.includes(search))) {
      const stats = await kvGet<SurveyStats>(kv, KVKeys.stats(survey.id));
      surveys.push({ ...survey, views: stats?.views || 0, submissions: stats?.submissions || 0 });
    }
  }
  surveys.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const total = surveys.length;
  surveys = surveys.slice((page - 1) * limit, page * limit);
  return { surveys, total };
}

export async function getResponseList(kv: KVNamespace, surveyId: string, page = 1, limit = 20) {
  const indexData = await kvGet<any[]>(kv, data:responses:) || [];
  let filtered = indexData.sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  const total = filtered.length;
  filtered = filtered.slice((page - 1) * limit, page * limit);
  return { responses: filtered, total };
}