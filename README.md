Run on startup for redis streams (news-raw, news-enriched):

docker run -d \
  --name redis-dev \
  -p 6379:6379 \
  redis:7

## Supabase Postgres configuration

The services use the `pg` driver and now support two DB config modes:

- `POSTGRES_URL` (preferred for Supabase)
- discrete fields: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

### Recommended env for Supabase

```
POSTGRES_URL=postgresql://...
POSTGRES_SSL=true
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
```

If you do not use `POSTGRES_URL`, set all `POSTGRES_*` discrete fields instead.

Optional Supabase app-layer values (for future API/table operations):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

### Apply migrations

Run:

```
psql "<your_supabase_connection_string>" -f services/market-data/sql/001_market_data_tables.sql
psql "<your_supabase_connection_string>" -f services/insider-detection/sql/001_insider_detection_tables.sql
```

This creates:

- `market_state_current`, `market_events` (market-data)
- `trades` hypertable, `market_baselines`, `anomalies`, `trades_5min` continuous aggregate (insider-detection)

For local dev with Docker Compose TimescaleDB:

```
psql "postgresql://kalshi:kalshi@localhost:5433/kalshi" -f services/insider-detection/sql/001_insider_detection_tables.sql
```

Enable the TimescaleDB extension on Supabase before running the insider-detection migration in production.

### Run services

```
node services/market-data/index.js
node services/market-matching/index.js
python services/insider-detection/index.py
node services/dashboard-api/index.js
```

`market-matching` now includes the trade history poller (60s). `insider-detection` runs baseline refresh (hourly) and anomaly scoring (5 min).

### Insider detection env vars

Trade poller (Node, in `market-matching`):

```
TRADE_POLL_INTERVAL_MS=60000
TRADES_PER_MARKET_FETCH=100
TRADE_POLL_CONCURRENCY=10
```

Anomaly scorer (Python):

```
ANOMALY_SCORER_INTERVAL_SEC=300
BASELINE_REFRESH_INTERVAL_SEC=3600
BASELINE_LOOKBACK_DAYS=7
VOLUME_SPIKE_MULTIPLIER=3.0
PRICE_MOVE_THRESHOLD=0.05
TRADE_CLUSTER_MULTIPLIER=3.0
RAPID_RESOLUTION_HOURS=2
RAPID_RESOLUTION_PRICE_THRESHOLD=0.10
PIN_THRESHOLD=0.15
PIN_MIN_DAYS=5
NEWS_BUFFER_MINUTES=15
```

### Anomalies API

```
GET /anomalies?since=<iso>&signal_type=<type>&limit=100
GET /anomalies/<market_id>?limit=100
```

Signal types: `volume_spike`, `price_no_news`, `trade_cluster`, `rapid_resolution`, `pin_elevated`.

### Dashboard dev (Vite + API proxy)

1. Start `dashboard-api` on port `4010` (default).
2. From `apps/dashboard`, run `npm run dev`.
3. The UI calls `/api/...`; Vite proxies that to the API (see `apps/dashboard/vite.config.js`). Override proxy target with `VITE_PROXY_TARGET` if needed.
4. Stack console (no Vite): open `http://localhost:4010/console` while `dashboard-api` is running.

### Docker Compose (Redis + TimescaleDB + services)

```
docker compose up --build
```

Set `REDIS_URL=redis://redis:6379` in `.env` for container networking (compose overrides `REDIS_URL` per service). For local TimescaleDB, point Postgres env at the compose service:

```
POSTGRES_HOST=timescaledb
POSTGRES_PORT=5432
POSTGRES_USER=kalshi
POSTGRES_PASSWORD=kalshi
POSTGRES_DB=kalshi
```

Apply the insider-detection migration once TimescaleDB is up, then open `http://localhost:4010/console` for a single-page ops view (`/health/*`, `/stack-status`, `/config`).

### Single port (UI + API + console)

Build the dashboard, then start `dashboard-api` only (after `market-data` has populated the DB, or run both):

```
cd apps/dashboard && npm run build && cd ../..
node services/dashboard-api/index.js
```

- UI: `http://localhost:4010/`
- Ops console: `http://localhost:4010/console`
- Remote viewing: tunnel port `4010` (for example `ngrok http 4010`) so one URL exposes UI, REST, SSE, and `/console`.

### Notes

- Supabase direct and pooler endpoints are both supported as long as credentials are valid.
- If TLS verification fails in your environment, keep `POSTGRES_SSL=true` and set `POSTGRES_SSL_REJECT_UNAUTHORIZED=false`.