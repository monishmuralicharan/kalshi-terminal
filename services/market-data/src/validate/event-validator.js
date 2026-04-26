import { EVENT_TYPES, validateMetaShape } from '../schema/events.js'

const VALID_TYPES = new Set(Object.values(EVENT_TYPES))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateCanonicalEvent(event) {
  assert(event && typeof event === 'object', 'event must be an object')
  assert(VALID_TYPES.has(event.type), `unsupported event type: ${event.type}`)
  assert(validateMetaShape(event.meta), 'invalid event metadata')
  assert(event.payload && typeof event.payload === 'object', 'payload is required')
  assert(event.payload.market_ticker, 'payload.market_ticker is required')
  assert(event.raw_extras && typeof event.raw_extras === 'object', 'raw_extras must be an object')

  if (event.type === EVENT_TYPES.BOOK_SNAPSHOT || event.type === EVENT_TYPES.BOOK_DELTA) {
    assert(event.payload.book && typeof event.payload.book === 'object', 'book payload required')
    assert(Array.isArray(event.payload.book.bids), 'book.bids must be an array')
    assert(Array.isArray(event.payload.book.asks), 'book.asks must be an array')
  }

  return event
}

export function isCanonicalEventValid(event) {
  try {
    validateCanonicalEvent(event)
    return true
  } catch {
    return false
  }
}
