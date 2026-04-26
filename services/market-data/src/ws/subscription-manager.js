export function createSubscriptionManager({ tickers = [] } = {}) {
  const desired = new Set(tickers)

  function buildSubscribeMessage() {
    return {
      action: 'subscribe',
      channels: ['orderbook', 'ticker', 'trade', 'status'],
      markets: [...desired],
    }
  }

  function setTickers(nextTickers) {
    desired.clear()
    for (const ticker of nextTickers ?? []) desired.add(ticker)
  }

  return {
    setTickers,
    getTickers: () => [...desired],
    buildSubscribeMessage,
  }
}
