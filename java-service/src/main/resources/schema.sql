CREATE TABLE IF NOT EXISTS jma_accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
);
CREATE TABLE IF NOT EXISTS jma_usage (
  email TEXT PRIMARY KEY REFERENCES jma_accounts(email) ON DELETE CASCADE,
  matches_used INTEGER NOT NULL DEFAULT 0 CHECK (matches_used >= 0),
  searches_used INTEGER NOT NULL DEFAULT 0 CHECK (searches_used >= 0),
  cv_generations_used INTEGER NOT NULL DEFAULT 0 CHECK (cv_generations_used >= 0)
);
CREATE TABLE IF NOT EXISTS jma_sessions (
  refresh_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES jma_accounts(id) ON DELETE CASCADE,
  access_id UUID NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE IF NOT EXISTS jma_otps (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  create_account BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jma_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jma_audit_log (
  id UUID PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  account_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS jma_sessions_expiry ON jma_sessions(expires_at);
CREATE INDEX IF NOT EXISTS jma_audit_account ON jma_audit_log(account_email, created_at);
