-- Short link site schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  domain TEXT,
  target_url TEXT NOT NULL,
  title TEXT,
  password_hash TEXT,
  password_salt TEXT,
  is_custom_code INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  target_edit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL,
  clicked_at TEXT NOT NULL,
  is_qr INTEGER NOT NULL DEFAULT 0,
  referrer TEXT,
  country TEXT,
  user_agent TEXT,
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
