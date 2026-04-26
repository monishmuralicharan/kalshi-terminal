import { kalshiGet } from '../../../common/kalshi/client.js'
import { EVENT_TYPES } from '../schema/events.js'
import { normalizeKalshiEvent } from '../normalize/kalshi-normalizer.js'

export function createMarketSnapshotPoller({ tickers = [] } = {}) {
  async function fetchSnapshotForTicker(ticker) {
    const data = await kalshiGet(`/trade-api/v2/markets/${encodeURIComponent(ticker)}`)
    const market = data.market ?? data
    return normalizeKalshiEvent(
      { ...market, type: EVENT_TYPES.MARKET_SNAPSHOT, market_ticker: market.ticker ?? ticker },
      { source: 'poll' },
    )
  }

  async function pollAll() {
    const events = []
    for (const ticker of tickers) {
      events.push(await fetchSnapshotForTicker(ticker))
    }
    return events
  }

  return { pollAll, fetchSnapshotForTicker }
}
