const API_BASE = "https://survey-system.19355681226.workers.dev";

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

interface ApiResponse {
  error?: string;
  [key: string]: any;
}

async function request(url: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const response = await fetch(API_BASE + url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function getUserUuid(): string {
  let uuid = localStorage.getItem("user_uuid");
  if (!uuid) { uuid = crypto.randomUUID(); localStorage.setItem("user_uuid", uuid); }
  return uuid;
}

export async function getSurvey(uniqueKey: string): Promise<ApiResponse> {
  const uuid = getUserUuid();
  return request("/api/survey/" + uniqueKey, { headers: { "X-User-Uuid": uuid } });
}

export async function recordVisit(surveyId: string, eventType: string): Promise<void> {
  const uniqueKey = sessionStorage.getItem("current_survey_key");
  if (!uniqueKey) return;
  const uuid = getUserUuid();
  await request("/api/survey/" + uniqueKey + "/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, user_uuid: uuid }),
  });
}

export async function getDraft(surveyId: string): Promise<ApiResponse> {
  const uuid = getUserUuid();
  return request("/api/draft/" + surveyId + "/" + uuid);
}

export async function saveDraft(surveyId: string, answers: Record<string, any>): Promise<void> {
  const uuid = getUserUuid();
  await request("/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ survey_id: surveyId, user_uuid: uuid, answers }),
  });
}

export async function submitResponse(surveyId: string, answers: Record<string, any>, uniqueKey?: string): Promise<void> {
  const uuid = getUserUuid();
  await request("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ survey_id: surveyId, unique_key: uniqueKey, user_uuid: uuid, answers }),
  });
}

export async function adminLogin(username: string, password: string): Promise<ApiResponse> {
  const data = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem("admin_token", data.token);
  return data;
}

export async function adminLogout(): Promise<void> { localStorage.removeItem("admin_token"); }

export async function getAdminMe(): Promise<ApiResponse> { return request("/api/auth/me"); }

export async function getSurveys(page: number = 1, limit: number = 20, search: string = ""): Promise<ApiResponse> {
  return request("/api/admin/surveys?page=" + page + "&limit=" + limit + "&search=" + encodeURIComponent(search));
}

export async function getSurveyDetail(id: string): Promise<ApiResponse> { return request("/api/admin/surveys/" + id); }

export async function createSurvey(data: Record<string, any>): Promise<ApiResponse> {
  return request("/api/admin/surveys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSurvey(id: string, data: Record<string, any>): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSurvey(id: string): Promise<void> { 
  await request("/api/admin/surveys/" + id, { method: "DELETE" }); 
}

export async function updateQuestions(surveyId: string, questions: any[]): Promise<void> {
  await request("/api/admin/surveys/" + surveyId + "/questions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions }),
  });
}

export async function getSurveyStats(surveyId: string): Promise<ApiResponse> { 
  return request("/api/admin/surveys/" + surveyId + "/stats"); 
}

export async function getSurveyResponses(surveyId: string, page: number = 1, limit: number = 20): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/responses?page=" + page + "&limit=" + limit);
}

export async function getExportData(surveyId: string): Promise<ApiResponse> { 
  return request("/api/admin/surveys/" + surveyId + "/export"); 
}

export async function uploadAndParseFile(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request("/api/admin/import/upload", { method: "POST", body: formData });
}

export async function confirmImport(data: Record<string, any>): Promise<ApiResponse> {
  return request("/api/admin/import/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getCodingThemes(surveyId: string): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/themes");
}

export async function updateCodingThemes(surveyId: string, themes: any[]): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/themes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes }),
  });
}

export async function getCodingDataset(surveyId: string, questionId: string): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/coding/" + questionId);
}

export async function runAiCoding(surveyId: string, questionId: string): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/coding/" + questionId + "/run", {
    method: "POST",
  });
}

export async function updateCodingResult(surveyId: string, questionId: string, responseId: string, themes: string[], keywords?: string[]): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/coding/" + questionId + "/result/" + responseId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes, keywords }),
  });
}

export async function exportCodingDataset(surveyId: string, questionId: string, format: string = "csv"): Promise<Response> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(API_BASE + "/api/admin/surveys/" + surveyId + "/coding/" + questionId + "/export?format=" + format, { headers });
}

export async function deleteCodingResults(surveyId: string, questionId: string, responseIds: string[]): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/coding/" + questionId + "/results", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responseIds }),
  });
}

export async function getAnomalyRules(): Promise<ApiResponse> {
  return request("/api/admin/rules");
}

export async function runQualityScan(surveyId: string): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/scan", {
    method: "POST",
  });
}

export async function getQualityReport(surveyId: string): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/report");
}

export async function flagResponse(surveyId: string, responseId: string, isFlagged: boolean, flagReasons?: string[]): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/responses/" + responseId + "/flag", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_flagged: isFlagged, flag_reasons: flagReasons }),
  });
}

export async function batchFlagResponses(surveyId: string, responseIds: string[], isFlagged: boolean, flagReasons?: string[]): Promise<ApiResponse> {
  return request("/api/admin/surveys/" + surveyId + "/responses/batch-flag", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responseIds, is_flagged: isFlagged, flag_reasons: flagReasons }),
  });
}

export async function exportQualityReport(surveyId: string, format: string = "csv"): Promise<Response> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(API_BASE + "/api/admin/surveys/" + surveyId + "/export?format=" + format, { headers });
}

