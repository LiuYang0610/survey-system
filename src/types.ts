// ============================================
// 共享类型定义
// ============================================

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ADMIN_DEFAULT_PASSWORD: string;
}

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
}

export interface Survey {
  id: string;
  unique_key: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'inactive';
  allow_resubmit: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  survey_id: string;
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: number;
  options: string; // JSON array
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
}

export interface Draft {
  id: string;
  survey_id: string;
  user_uuid: string;
  answers: string; // JSON object
  created_at: string;
  updated_at: string;
}

export interface Response {
  id: string;
  survey_id: string;
  user_uuid: string;
  answers: string;
  ip_address: string | null;
  user_agent: string | null;
  submitted_at: string;
}

export interface ImportFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: 'xlsx' | 'docx' | 'pdf';
  status: 'uploaded' | 'parsed' | 'confirmed' | 'failed';
  parsed_data: string;
  error_message: string | null;
  created_at: string;
}

export interface ParsedQuestion {
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: boolean;
  options: string[];
  scale_min?: number;
  scale_max?: number;
  scale_min_label?: string;
  scale_max_label?: string;
  errors?: string[];
}

export interface VisitLog {
  id: number;
  survey_id: string;
  user_uuid: string | null;
  event_type: 'view' | 'start' | 'submit';
  created_at: string;
}

export interface SurveyStats {
  total_views: number;
  total_starts: number;
  total_submissions: number;
  completion_rate: number;
  status: string;
  created_at: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}
