import { EVENT_TYPES } from '../schema/events.js'

export function createOrderbookReconciler({ onGap }) {
  const sequenceByTicker = new Map()

  function reconcile(event) {
    const ticker = event.meta.market_ticker
    if (!ticker) return { accepted: false, reason: 'missing_ticker' }

    const seq = event.meta.sequence
    const prev = sequenceByTicker.get(ticker)
    if (typeof seq === 'number' && typeof prev === 'number') {
      if (seq <= prev) return { accepted: false, reason: 'out_of_order' }
      if (event.type === EVENT_TYPES.BOOK_DELTA && seq > prev + 1) {
        onGap?.({ market_ticker: ticker, expected: prev + 1, got: seq })
      }
    }

    if (typeof seq === 'number') sequenceByTicker.set(ticker, seq)
    return { accepted: true }
  }

  return { reconcile }
}
