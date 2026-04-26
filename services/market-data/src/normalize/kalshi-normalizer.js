import { buildCanonicalEvent, EVENT_TYPES } from '../schema/events.js'

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asIso = (value) => {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

function normalizeLevel(level) {
  return {
    price: asNumber(level.price),
    size: asNumber(level.size),
  }
}

function normalizeBook(raw = {}) {
  const bids = Array.isArray(raw.bids) ? raw.bids.map(normalizeLevel) : []
  const asks = Array.isArray(raw.asks) ? raw.asks.map(normalizeLevel) : []
  return { bids, asks }
}

export function normalizeKalshiEvent(raw, { source = 'ws' } = {}) {
  const type = raw.type ?? EVENT_TYPES.TICKER_UPDATE
  const marketTicker = raw.market_ticker ?? raw.ticker ?? ''
  const meta = {
    provider_ts: asIso(raw.ts ?? raw.timestamp ?? raw.updated_at),
    ingest_ts: new Date().toISOString(),
    sequence: raw.sequence ?? raw.seq ?? null,
    source,
    market_ticker: marketTicker,
    raw_payload_version: 'kalshi-v1',
  }

  switch (type) {
    case EVENT_TYPES.BOOK_SNAPSHOT:
    case EVENT_TYPES.BOOK_DELTA: {
      const payload = {
        market_ticker: marketTicker,
        book: normalizeBook(raw.book ?? raw),
      }
      return buildCanonicalEvent(type, payload, meta, raw)
    }
    case EVENT_TYPES.MARKET_SNAPSHOT: {
      const payload = {
        market_ticker: marketTicker,
        title: String(raw.title ?? ''),
        status: String(raw.status ?? 'unknown'),
        best_bid: asNumber(raw.best_bid ?? raw.yes_bid ?? raw.yes_bid_dollars),
        best_ask: asNumber(raw.best_ask ?? raw.yes_ask ?? raw.yes_ask_dollars),
        last_price: asNumber(raw.last_price),
        volume: asNumber(raw.volume),
        open_interest: asNumber(raw.open_interest),
        close_time: raw.close_time ?? null,
      }
      return buildCanonicalEvent(type, payload, meta, raw)
    }
    case EVENT_TYPES.TRADE_TICK: {
      const payload = {
        market_ticker: marketTicker,
        price: asNumber(raw.price),
        size: asNumber(raw.size),
        side: String(raw.side ?? 'unknown'),
        trade_id: String(raw.trade_id ?? ''),
      }
      return buildCanonicalEvent(type, payload, meta, raw)
    }
    case EVENT_TYPES.STATUS_UPDATE:
    case EVENT_TYPES.TICKER_UPDATE:
    default: {
      const payload = {
        market_ticker: marketTicker,
        status: String(raw.status ?? 'unknown'),
        best_bid: asNumber(raw.best_bid ?? raw.yes_bid ?? raw.yes_bid_dollars),
        best_ask: asNumber(raw.best_ask ?? raw.yes_ask ?? raw.yes_ask_dollars),
        last_price: asNumber(raw.last_price),
        volume: asNumber(raw.volume),
        open_interest: asNumber(raw.open_interest),
      }
      return buildCanonicalEvent(type, payload, meta, raw)
    }
  }
}
