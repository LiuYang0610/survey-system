import type { Survey, SurveyStats, CodingDataset, DataQualityReport, AnomalyRule, OperationLog, VersionSnapshot } from "../types";

export const KVKeys = {
  admin: (u: string) => `admin:${u}`,
  survey: (id: string) => `survey:${id}`,
  surveyByKey: (k: string) => `survey:key:${k}`,
  surveyList: () => "index:surveys",
  draft: (s: string, u: string) => `draft:${s}:${u}`,
  response: (s: string, u: string) => `response:${s}:${u}`,
  stats: (s: string) => `stats:${s}`,
  // AI Coding
  codingDataset: (surveyId: string, questionId: string) => `coding:${surveyId}:${questionId}`,
  codingThemes: (surveyId: string) => `coding:themes:${surveyId}`,
  // Data Quality
  qualityReport: (surveyId: string) => `quality:${surveyId}`,
  qualityRules: () => "quality:rules",
  // Version & Snapshots
  snapshot: (snapshotId: string) => `snapshot:${snapshotId}`,
  snapshotList: (surveyId: string) => `snapshots:${surveyId}`,
  operationLog: (surveyId: string) => `logs:${surveyId}`,
};

export async function kvGet<T = any>(kv: KVNamespace, key: string): Promise<T | null> {
  return await kv.get(key, "json") as T | null;
}

export async function kvPut(kv: KVNamespace, key: string, value: any): Promise<void> {
  await kv.put(key, JSON.stringify(value));
}

export async function kvDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

export async function kvListAppend(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = (await kvGet<string[]>(kv, listKey)) || [];
  if (!list.includes(itemId)) { list.unshift(itemId); await kvPut(kv, listKey, list); }
}

export async function kvListRemove(kv: KVNamespace, listKey: string, itemId: string): Promise<void> {
  const list = (await kvGet<string[]>(kv, listKey)) || [];
  await kvPut(kv, listKey, list.filter(id => id !== itemId));
}

export async function getSurveyList(kv: KVNamespace, page = 1, limit = 20, search = "") {
  const allIds = (await kvGet<string[]>(kv, "index:surveys")) || [];
  let surveys = [];
  for (const id of allIds) {
    const survey = await kvGet<Survey>(kv, "survey:" + id);
    if (survey && (!search || survey.title.includes(search))) {
      const stats = await kvGet<SurveyStats>(kv, "stats:" + survey.id);
      surveys.push({ ...survey, views: stats?.views || 0, submissions: stats?.submissions || 0 });
    }
  }
  surveys.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const total = surveys.length;
  surveys = surveys.slice((page - 1) * limit, page * limit);
  return { surveys, total };
}

export async function getResponseList(kv: KVNamespace, surveyId: string, page = 1, limit = 20) {
  const indexData = (await kvGet<any[]>(kv, "data:responses:" + surveyId)) || [];
  let filtered = indexData.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  const total = filtered.length;
  filtered = filtered.slice((page - 1) * limit, page * limit);
  return { responses: filtered, total };
}

// AI Coding helpers
export async function getCodingDataset(kv: KVNamespace, surveyId: string, questionId: string): Promise<CodingDataset | null> {
  return await kvGet<CodingDataset>(kv, KVKeys.codingDataset(surveyId, questionId));
}

export async function saveCodingDataset(kv: KVNamespace, dataset: CodingDataset): Promise<void> {
  await kvPut(kv, KVKeys.codingDataset(dataset.survey_id, dataset.question_id), dataset);
}

export async function getCodingThemes(kv: KVNamespace, surveyId: string): Promise<CodingTheme[]> {
  return (await kvGet<CodingTheme[]>(kv, KVKeys.codingThemes(surveyId))) || [];
}

export async function saveCodingThemes(kv: KVNamespace, surveyId: string, themes: CodingTheme[]): Promise<void> {
  await kvPut(kv, KVKeys.codingThemes(surveyId), themes);
}

// Data Quality helpers
export async function getQualityReport(kv: KVNamespace, surveyId: string): Promise<DataQualityReport | null> {
  return await kvGet<DataQualityReport>(kv, KVKeys.qualityReport(surveyId));
}

export async function saveQualityReport(kv: KVNamespace, report: DataQualityReport): Promise<void> {
  await kvPut(kv, KVKeys.qualityReport(report.survey_id), report);
}

export async function getDefaultAnomalyRules(): Promise<AnomalyRule[]> {
  return [
    {
      id: "speed",
      name: "极速作答",
      description: "作答时间过短，可能未认真填写",
      type: "speed",
      enabled: true,
      threshold: 30,
      config: { min_seconds: 30 }
    },
    {
      id: "pattern",
      name: "连续相同选项",
      description: "多个题目选择相同选项，可能是随意填写",
      type: "pattern",
      enabled: true,
      threshold: 5,
      config: { min_consecutive: 5 }
    },
    {
      id: "logic",
      name: "逻辑矛盾",
      description: "答案之间存在逻辑矛盾",
      type: "logic",
      enabled: true,
      config: {}
    },
    {
      id: "range",
      name: "数值超出范围",
      description: "数值答案超出合理区间",
      type: "range",
      enabled: true,
      config: {}
    },
    {
      id: "gibberish",
      name: "乱码填充",
      description: "文本答案包含乱码或无意义字符",
      type: "gibberish",
      enabled: true,
      config: { min_meaningful_ratio: 0.3 }
    }
  ];
}

// Operation Log helpers
export async function saveOperationLog(kv: KVNamespace, surveyId: string, log: OperationLog): Promise<void> {
  const logsKey = KVKeys.operationLog(surveyId);
  const logs = (await kvGet<OperationLog[]>(kv, logsKey)) || [];
  logs.unshift(log);
  // Keep only the last 200 logs
  await kvPut(kv, logsKey, logs.slice(0, 200));
}

export async function getOperationLogs(kv: KVNamespace, surveyId: string, limit: number = 50): Promise<OperationLog[]> {
  const logsKey = KVKeys.operationLog(surveyId);
  const logs = (await kvGet<OperationLog[]>(kv, logsKey)) || [];
  return logs.slice(0, limit);
}

// Snapshot helpers
export async function saveSnapshot(kv: KVNamespace, snapshot: VersionSnapshot): Promise<void> {
  await kvPut(kv, KVKeys.snapshot(snapshot.id), snapshot);
  // Update snapshot list
  const listKey = KVKeys.snapshotList(snapshot.survey_id);
  const list = (await kvGet<string[]>(kv, listKey)) || [];
  if (!list.includes(snapshot.id)) {
    list.unshift(snapshot.id);
    await kvPut(kv, listKey, list);
  }
}

export async function getSnapshots(kv: KVNamespace, surveyId: string): Promise<VersionSnapshot[]> {
  const listKey = KVKeys.snapshotList(surveyId);
  const snapshotIds = (await kvGet<string[]>(kv, listKey)) || [];
  const snapshots: VersionSnapshot[] = [];
  for (const id of snapshotIds.slice(0, 20)) {
    const snap = await kvGet<VersionSnapshot>(kv, KVKeys.snapshot(id));
    if (snap) snapshots.push(snap);
  }
  return snapshots;
}

export async function getSnapshot(kv: KVNamespace, snapshotId: string): Promise<VersionSnapshot | null> {
  return await kvGet<VersionSnapshot>(kv, KVKeys.snapshot(snapshotId));
}

// CodingTheme type (re-export for convenience)
export interface CodingTheme {
  id: string;
  name: string;
  description: string;
  color: string;
}
