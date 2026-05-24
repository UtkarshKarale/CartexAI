export const sqliteSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  auth_kind TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  credential_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  trusted_at TEXT NOT NULL,
  last_seen_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  locked_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  remember_device INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL,
  auto_lock_minutes INTEGER NOT NULL,
  privacy_mode INTEGER NOT NULL,
  analytics_enabled INTEGER NOT NULL,
  default_model TEXT NOT NULL,
  accent TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  preview TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  step_count INTEGER NOT NULL,
  last_run_at TEXT
);

CREATE TABLE IF NOT EXISTS indexed_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  granted INTEGER NOT NULL,
  scope TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_preferences (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
`

