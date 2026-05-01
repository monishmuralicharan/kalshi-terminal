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

### Apply market-data migration

Run:

```
psql "<your_supabase_connection_string>" -f services/market-data/sql/001_market_data_tables.sql
```

This creates:

- `market_state_current`
- `market_events`

### Run services

```
node services/market-data/index.js
node services/dashboard-api/index.js
```

### Dashboard dev (Vite + API proxy)

1. Start `dashboard-api` on port `4010` (default).
2. From `apps/dashboard`, run `npm run dev`.
3. The UI calls `/api/...`; Vite proxies that to the API (see `apps/dashboard/vite.config.js`). Override proxy target with `VITE_PROXY_TARGET` if needed.
4. Stack console (no Vite): open `http://localhost:4010/console` while `dashboard-api` is running.

### Docker Compose (Redis + services)

```
docker compose up --build
```

Set `REDIS_URL=redis://redis:6379` in `.env` for container networking (compose overrides `REDIS_URL` per service). Open `http://localhost:4010/console` for a single-page ops view (`/health/*`, `/stack-status`, `/config`).

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