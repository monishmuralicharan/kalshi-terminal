-- Insider detection tables (TimescaleDB)
-- Run against Supabase (with timescaledb extension) or local TimescaleDB.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS trades (
  time        TIMESTAMPTZ NOT NULL,
  trade_id    TEXT NOT NULL,
  market_id   TEXT NOT NULL,
  price       DOUBLE PRECISION,
  size        INTEGER,
  direction   TEXT CHECK (direction IN ('yes', 'no'))
);

SELECT create_hypertable('trades', 'time', if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS trades_time_trade_id_idx ON trades (time, trade_id);
CREATE INDEX IF NOT EXISTS trades_market_time_idx ON trades (market_id, time DESC);

CREATE TABLE IF NOT EXISTS market_baselines (
  market_id              TEXT NOT NULL,
  hour_of_week           INTEGER NOT NULL CHECK (hour_of_week >= 0 AND hour_of_week <= 167),
  avg_volume_per_hour    DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_price_volatility   DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_trade_count_5min   DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_days            INTEGER NOT NULL DEFAULT 0,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_id, hour_of_week)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id            BIGSERIAL PRIMARY KEY,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  market_id     TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  signal_type   TEXT NOT NULL CHECK (signal_type IN (
    'volume_spike', 'price_no_news', 'trade_cluster',
    'rapid_resolution', 'pin_elevated'
  )),
  score         DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
  details       JSONB NOT NULL DEFAULT '{}',
  pin_score     DOUBLE PRECISION,
  acknowledged  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS anomalies_detected_at_idx ON anomalies (detected_at DESC);
CREATE INDEX IF NOT EXISTS anomalies_market_id_idx ON anomalies (market_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS anomalies_signal_type_idx ON anomalies (signal_type, detected_at DESC);

-- Continuous aggregate for 5-minute trade rollups (performance).
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS bucket,
  market_id,
  SUM(size) AS volume,
  COUNT(*) AS trade_count,
  AVG(price) AS avg_price,
  STDDEV(price) AS price_stddev
FROM trades
GROUP BY bucket, market_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('trades_5min',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);
