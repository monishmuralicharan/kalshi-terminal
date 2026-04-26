export function createBookStore() {
  const byTicker = new Map()

  function upsert(event) {
    const ticker = event.meta.market_ticker
    const previous = byTicker.get(ticker) ?? {
      market_ticker: ticker,
      last_sequence: null,
      source: event.meta.source,
      last_provider_ts: null,
      updated_at: null,
      book: { bids: [], asks: [] },
      ticker: {},
      status: 'unknown',
    }
    const next = {
      ...previous,
      source: event.meta.source,
      last_sequence: event.meta.sequence ?? previous.last_sequence,
      last_provider_ts: event.meta.provider_ts,
      updated_at: event.meta.ingest_ts,
    }

    if (event.payload.book) next.book = event.payload.book
    if (event.payload.status) next.status = event.payload.status
    next.ticker = {
      ...next.ticker,
      best_bid: event.payload.best_bid ?? next.ticker.best_bid ?? 0,
      best_ask: event.payload.best_ask ?? next.ticker.best_ask ?? 0,
      last_price: event.payload.last_price ?? next.ticker.last_price ?? 0,
      volume: event.payload.volume ?? next.ticker.volume ?? 0,
      open_interest: event.payload.open_interest ?? next.ticker.open_interest ?? 0,
    }

    byTicker.set(ticker, next)
    return next
  }

  return {
    upsert,
    get: (ticker) => byTicker.get(ticker) ?? null,
    list: () => [...byTicker.values()],
  }
}
