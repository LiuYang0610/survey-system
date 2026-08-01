// API 客户端工具

const API_BASE = '/api';

// 通用请求方法
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  
  return data as T;
}

// 获取 user_uuid（自动创建）
export function getUserUuid(): string {
  let uuid = localStorage.getItem('user_uuid');
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem('user_uuid', uuid);
  }
  return uuid;
}

// ============ 公开 API ============

export async function getSurvey(uniqueKey: string) {
  const uuid = getUserUuid();
  return request<{
    id: string;
    title: string;
    description: string;
    status: string;
    questions: Array<{
      id: string;
      sort_order: number;
      type: string;
      title: string;
      description: string;
      required: number;
      options: string[];
      scale_min: number;
      scale_max: number;
      scale_min_label: string;
      scale_max_label: string;
    }>;
  }>(`/survey/${uniqueKey}`, {
    headers: { 'X-User-Uuid': uuid },
  });
}

export async function recordVisit(surveyId: string, eventType: string) {
  const uuid = getUserUuid();
  // 获取 unique_key（从缓存）
  const uniqueKey = sessionStorage.getItem('current_survey_key');
  if (!uniqueKey) return;
  
  return request(`/survey/${uniqueKey}/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, user_uuid: uuid }),
  });
}

// ============ 草稿 API ============

export async function getDraft(surveyId: string) {
  const uuid = getUserUuid();
  return request<{ draft: { answers: Record<string, any> } | null }>(
    `/draft/${surveyId}/${uuid}`
  );
}

export async function saveDraft(surveyId: string, answers: Record<string, any>) {
  const uuid = getUserUuid();
  return request('/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survey_id: surveyId, user_uuid: uuid, answers }),
  });
}

// ============ 提交 API ============

export async function submitResponse(surveyId: string, answers: Record<string, any>) {
  const uuid = getUserUuid();
  return request<{ ok: boolean; message: string }>('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survey_id: surveyId, user_uuid: uuid, answers }),
  });
}

// ============ 管理后台 API ============

export async function adminLogin(username: string, password: string) {
  const data = await request<{
    token: string;
    user: { id: string; username: string; display_name: string };
  }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  
  localStorage.setItem('admin_token', data.token);
  return data;
}

export async function adminLogout() {
  localStorage.removeItem('admin_token');
}

export async function getAdminMe() {
  return request<{ user: { id: string; username: string; display_name: string } }>('/auth/me');
}

export async function getSurveys(page = 1, limit = 20, search = '') {
  return request<{
    surveys: Array<{
      id: string;
      unique_key: string;
      title: string;
      description: string;
      status: string;
      created_at: string;
      views: number;
      submissions: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }>(`/admin/surveys?page=${page}&limit=${limit}&search=${search}`);
}

export async function getSurveyDetail(id: string) {
  return request<any>(`/admin/surveys/${id}`);
}

export async function createSurvey(data: { title: string; description?: string; questions?: any[] }) {
  return request<{ id: string; unique_key: string; message: string }>('/admin/surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateSurvey(id: string, data: any) {
  return request(`/admin/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteSurvey(id: string) {
  return request(`/admin/surveys/${id}`, { method: 'DELETE' });
}

export async function updateQuestions(surveyId: string, questions: any[]) {
  return request(`/admin/surveys/${surveyId}/questions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  });
}

export async function getSurveyStats(surveyId: string) {
  return request<{
    total_views: number;
    total_starts: number;
    total_submissions: number;
    completion_rate: number;
    status: string;
    created_at: string;
  }>(`/admin/surveys/${surveyId}/stats`);
}

export async function getSurveyResponses(
  surveyId: string,
  page = 1,
  limit = 20,
  startDate?: string,
  endDate?: string
) {
  let url = `/admin/surveys/${surveyId}/responses?page=${page}&limit=${limit}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;
  return request<{
    responses: Array<{
      id: string;
      user_uuid: string;
      answers: Record<string, any>;
      submitted_at: string;
    }>;
    total: number;
  }>(url);
}

export async function getExportData(surveyId: string) {
  return request<any>(`/admin/surveys/${surveyId}/export`);
}

// ============ 导入 API ============

export async function getImportPresign(filename: string, contentType: string) {
  return request<{ import_id: string; r2_key: string; upload_url: string }>(
    '/admin/import/presign',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content_type: contentType }),
    }
  );
}

export async function uploadFile(importId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  
  return request<{ message: string }>(`/admin/import/upload/${importId}`, {
    method: 'POST',
    body: formData,
  });
}

export async function parseImportFile(importId: string) {
  return request<{
    import_id: string;
    title: string;
    description: string;
    questions: any[];
  }>(`/admin/import/parse/${importId}`, {
    method: 'POST',
  });
}

export async function confirmImport(data: {
  import_id: string;
  title: string;
  description?: string;
  questions: any[];
}) {
  return request<{ survey_id: string; unique_key: string; message: string }>(
    '/admin/import/confirm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
}

