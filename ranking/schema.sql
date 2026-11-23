CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  mode INTEGER NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(uuid, mode)
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (mode, score DESC, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_scores_uuid ON scores (uuid, mode);
