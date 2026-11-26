CREATE TABLE IF NOT EXISTS matches (
  match_key TEXT PRIMARY KEY,
  match_id BIGINT NOT NULL UNIQUE,
  stake BIGINT NOT NULL,
  status SMALLINT NOT NULL,
  winner SMALLINT NOT NULL DEFAULT 0,
  fighter_a TEXT, fighter_b TEXT,
  ai_flags SMALLINT NOT NULL DEFAULT 0,
  market_live TEXT, market_delayed TEXT,
  tick INT NOT NULL DEFAULT 0,
  state_hash TEXT,
  start_unix BIGINT, end_unix BIGINT,
  finalized SMALLINT NOT NULL DEFAULT 0,
  record_written BOOLEAN NOT NULL DEFAULT FALSE,
  record_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticks (
  match_key TEXT NOT NULL,
  tick INT NOT NULL,
  input_a INT NOT NULL,
  input_b INT NOT NULL,
  flags BIGINT NOT NULL,
  fair_p DOUBLE PRECISION NOT NULL,
  state_hash TEXT NOT NULL,
  signature TEXT,
  seen_ms BIGINT NOT NULL,
  PRIMARY KEY (match_key, tick)
);
CREATE TABLE IF NOT EXISTS seeds (
  match_key TEXT NOT NULL,
  wave INT NOT NULL,
  apply_at_tick INT NOT NULL,
  seed TEXT NOT NULL,
  signature TEXT,
  PRIMARY KEY (match_key, wave)
);
CREATE TABLE IF NOT EXISTS quotes (
  market TEXT NOT NULL,
  tick BIGINT NOT NULL,
  mode SMALLINT NOT NULL,
  fair_p DOUBLE PRECISION NOT NULL,
  bid_a BIGINT, ask_a BIGINT, bid_b BIGINT, ask_b BIGINT,
  seen_ms BIGINT NOT NULL,
  PRIMARY KEY (market, tick)
);
CREATE TABLE IF NOT EXISTS trades (
  signature TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  mode SMALLINT NOT NULL,
  trader TEXT NOT NULL,
  tick BIGINT NOT NULL,
  seen_tick BIGINT NOT NULL,
  price BIGINT NOT NULL,
  qty BIGINT NOT NULL,
  side SMALLINT NOT NULL,
  dir SMALLINT NOT NULL,
  seen_ms BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rejections (
  signature TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  mode SMALLINT NOT NULL,
  trader TEXT NOT NULL,
  tick BIGINT NOT NULL,
  seen_tick BIGINT NOT NULL,
  reason INT NOT NULL,
  failed_tx BOOLEAN NOT NULL DEFAULT FALSE,
  seen_ms BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS hashes (
  match_key TEXT NOT NULL,
  tick INT NOT NULL,
  state_hash TEXT NOT NULL,
  PRIMARY KEY (match_key, tick)
);
CREATE TABLE IF NOT EXISTS latency (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  ms DOUBLE PRECISION NOT NULL,
  match_key TEXT,
  signature TEXT,
  host TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS latency_kind ON latency(kind);
CREATE INDEX IF NOT EXISTS trades_market ON trades(market);
