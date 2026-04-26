CREATE TABLE IF NOT EXISTS market_state_current (
  market_ticker TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  last_sequence BIGINT NULL,
  last_provider_ts TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  ticker_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  book_data JSONB NOT NULL DEFAULT '{"bids":[],"asks":[]}'::jsonb
);

CREATE TABLE IF NOT EXISTS market_events (
  id BIGSERIAL PRIMARY KEY,
  market_ticker TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_ts TIMESTAMPTZ NOT NULL,
  ingest_ts TIMESTAMPTZ NOT NULL,
  sequence BIGINT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  raw_extras JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS market_events_ticker_provider_ts_idx
  ON market_events (market_ticker, provider_ts DESC);
