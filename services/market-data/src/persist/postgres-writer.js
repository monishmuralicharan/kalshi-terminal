export function createPostgresWriter(pool) {
  async function saveCurrent(state) {
    await pool.query(
      `INSERT INTO market_state_current
         (market_ticker, source, last_sequence, last_provider_ts, updated_at, status, ticker_data, book_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (market_ticker) DO UPDATE SET
         source = EXCLUDED.source,
         last_sequence = EXCLUDED.last_sequence,
         last_provider_ts = EXCLUDED.last_provider_ts,
         updated_at = EXCLUDED.updated_at,
         status = EXCLUDED.status,
         ticker_data = EXCLUDED.ticker_data,
         book_data = EXCLUDED.book_data`,
      [
        state.market_ticker,
        state.source,
        state.last_sequence,
        state.last_provider_ts,
        state.updated_at,
        state.status,
        JSON.stringify(state.ticker ?? {}),
        JSON.stringify(state.book ?? { bids: [], asks: [] }),
      ],
    )
  }

  async function appendEvent(event) {
    await pool.query(
      `INSERT INTO market_events
         (market_ticker, event_type, provider_ts, ingest_ts, sequence, source, payload, raw_extras)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.meta.market_ticker,
        event.type,
        event.meta.provider_ts,
        event.meta.ingest_ts,
        event.meta.sequence,
        event.meta.source,
        JSON.stringify(event.payload),
        JSON.stringify(event.raw_extras ?? {}),
      ],
    )
  }

  return { saveCurrent, appendEvent }
}
