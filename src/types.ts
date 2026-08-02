export interface Env {
  KV: KVNamespace;
  JWT_SECRET: string;
}

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role?: 'admin' | 'user';
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
  visible?: number;
  skip_logic?: SkipLogic[];
  show_logic?: ShowLogic[];
}

export interface SkipLogic {
  id: string;
  source_question_id: string;
  condition: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  condition_value: string;
  target_question_id: string;
  action: 'skip_to' | 'end';
}

export interface ShowLogic {
  id: string;
  source_question_id: string;
  condition: 'equals' | 'not_equals' | 'contains';
  condition_value: string;
  target_question_id: string;
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
  duration_seconds?: number;
  is_flagged?: boolean;
  flag_reasons?: string[];
}

export interface SurveyStats {
  views: number;
  starts: number;
  submissions: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role?: string;
  iat: number;
  exp: number;
}
