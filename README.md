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

### Notes

- Supabase direct and pooler endpoints are both supported as long as credentials are valid.
- If TLS verification fails in your environment, keep `POSTGRES_SSL=true` and set `POSTGRES_SSL_REJECT_UNAUTHORIZED=false`.