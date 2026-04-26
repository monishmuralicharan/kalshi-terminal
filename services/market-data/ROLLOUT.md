# Market Data Rollout

## Stage 1: Shadow ingest
- Start `market-data` with production credentials and a limited `MARKET_TICKERS` list.
- Keep dashboard consumers disconnected.
- Validate event counts, sequence gaps, and fallback transitions from periodic logs.

## Stage 2: Read-only dashboard API
- Start `dashboard-api` and validate `/health/live`, `/health/ready`, `/markets`, and `/stream`.
- Compare `market_state_current` rows against direct Kalshi snapshots for sampled tickers.

## Stage 3: Internal UI
- Run `apps/dashboard` in internal environment and subscribe to sampled markets.
- Verify bid/ask and depth updates against Kalshi source views.
- Confirm connection transitions (`ws_live`, `poll_fallback`, `reconnecting`) appear as expected.

## Stage 4: Gradual expansion
- Increase `MARKET_TICKERS` batch size.
- Monitor `sequence_gaps`, poll fallback duration, and end-to-end lag.
- Enable external users once lag and gap rates stay within acceptable range.
