const CHANNELS = {
  book_snapshot: 'market-book-live',
  book_delta: 'market-book-live',
  market_snapshot: 'market-status-live',
  ticker_update: 'market-status-live',
  status_update: 'market-status-live',
  trade_tick: 'market-trades-live',
}

export function createRedisPublisher(redis) {
  return {
    async publish(event) {
      const channel = CHANNELS[event.type] ?? 'market-live'
      await redis.publish(channel, JSON.stringify(event))
      return channel
    },
  }
}
