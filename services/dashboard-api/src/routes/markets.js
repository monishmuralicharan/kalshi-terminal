export function createMarketRoutes({ pool, cache }) {
  async function listMarkets() {
    const fromCache = cache.list()
    if (fromCache.length) return fromCache.map((m) => m.market_ticker)
    const res = await pool.query('SELECT market_ticker FROM market_state_current ORDER BY market_ticker')
    return res.rows.map((r) => r.market_ticker)
  }

  async function getSnapshot(ticker) {
    const cached = cache.get(ticker)
    if (cached) return cached
    const res = await pool.query(
      `SELECT market_ticker, source, last_sequence, last_provider_ts, updated_at, status, ticker_data, book_data
       FROM market_state_current WHERE market_ticker = $1`,
      [ticker],
    )
    return res.rows[0] ?? null
  }

  async function getRecentEvents(ticker, limit = 200) {
    const res = await pool.query(
      `SELECT market_ticker, event_type, provider_ts, ingest_ts, sequence, source, payload
       FROM market_events
       WHERE market_ticker = $1
       ORDER BY id DESC
       LIMIT $2`,
      [ticker, limit],
    )
    return res.rows
  }

  return { listMarkets, getSnapshot, getRecentEvents }
}
