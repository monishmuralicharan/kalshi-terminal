export const EVENT_SCHEMA_VERSION = 1

export const EVENT_TYPES = Object.freeze({
  MARKET_SNAPSHOT: 'market_snapshot',
  BOOK_SNAPSHOT: 'book_snapshot',
  BOOK_DELTA: 'book_delta',
  TRADE_TICK: 'trade_tick',
  TICKER_UPDATE: 'ticker_update',
  STATUS_UPDATE: 'status_update',
})

export const SOURCE_TYPES = Object.freeze({
  WS: 'ws',
  POLL: 'poll',
})

const REQUIRED_META = ['provider_ts', 'ingest_ts', 'market_ticker', 'source', 'raw_payload_version']

export function buildEventMeta(partial = {}) {
  return {
    schema_version: EVENT_SCHEMA_VERSION,
    provider_ts: partial.provider_ts ?? new Date().toISOString(),
    ingest_ts: partial.ingest_ts ?? new Date().toISOString(),
    sequence: partial.sequence ?? null,
    source: partial.source ?? SOURCE_TYPES.WS,
    market_ticker: partial.market_ticker ?? '',
    raw_payload_version: partial.raw_payload_version ?? 'kalshi-v1',
  }
}

export function buildCanonicalEvent(type, payload, meta, rawExtras = {}) {
  return {
    type,
    meta: buildEventMeta(meta),
    payload,
    raw_extras: rawExtras ?? {},
  }
}

export function validateMetaShape(meta) {
  for (const key of REQUIRED_META) {
    if (!meta?.[key]) return false
  }
  return meta.source === SOURCE_TYPES.WS || meta.source === SOURCE_TYPES.POLL
}
