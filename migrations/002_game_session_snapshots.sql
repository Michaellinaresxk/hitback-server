CREATE TABLE IF NOT EXISTS game_session_snapshots (
  id VARCHAR(50) PRIMARY KEY,
  session_data JSONB NOT NULL,
  capability_token_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_session_snapshots_capability_hash
  ON game_session_snapshots (capability_token_hash);
