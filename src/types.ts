// ============================================
// 共享类型定义（KV 存储版）
// ============================================

export interface Env {
  KV: KVNamespace;
  JWT_SECRET: string;
}

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
}

export interface Survey {
  id: string;
  unique_key: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'inactive';
  allow_resubmit: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions: Question[];
}

export interface Question {
  id: string;
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: number;
  options: string[];
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
}

export interface Draft {
  survey_id: string;
  user_uuid: string;
  answers: Record<string, any>;
  updated_at: string;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_uuid: string;
  answers: Record<string, any>;
  submitted_at: string;
}

export interface SurveyStats {
  views: number;
  starts: number;
  submissions: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}
