-- ============================================
-- 问卷系统数据库 Schema (Cloudflare D1)
-- ============================================

-- 管理员用户表
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 问卷表
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  unique_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK(status IN ('draft','active','inactive')),
  allow_resubmit INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 题目表
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single','multiple','text','scale')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  required INTEGER DEFAULT 0,
  options TEXT DEFAULT '[]',
  scale_min INTEGER DEFAULT 1,
  scale_max INTEGER DEFAULT 5,
  scale_min_label TEXT DEFAULT '非常不满意',
  scale_max_label TEXT DEFAULT '非常满意',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

-- 草稿表（断点续填）
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  user_uuid TEXT NOT NULL,
  answers TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(survey_id, user_uuid)
);

-- 正式答卷表
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  user_uuid TEXT NOT NULL,
  answers TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(survey_id, user_uuid)
);

-- 导入文件临时表
CREATE TABLE IF NOT EXISTS import_files (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('xlsx','docx','pdf')),
  status TEXT DEFAULT 'uploaded' CHECK(status IN ('uploaded','parsed','confirmed','failed')),
  parsed_data TEXT DEFAULT '[]',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 访问日志表（统计用）
CREATE TABLE IF NOT EXISTS visit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  user_uuid TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('view','start','submit')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_surveys_unique_key ON surveys(unique_key);
CREATE INDEX IF NOT EXISTS idx_questions_survey_id ON questions(survey_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_drafts_lookup ON drafts(survey_id, user_uuid);
CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_responses_user ON responses(survey_id, user_uuid);
CREATE INDEX IF NOT EXISTS idx_visit_logs_survey ON visit_logs(survey_id, created_at);
