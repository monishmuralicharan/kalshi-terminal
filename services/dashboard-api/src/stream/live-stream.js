const LIVE_CHANNELS = ['market-book-live', 'market-status-live', 'market-trades-live']

export function createLiveStream({ redisSub, clients }) {
  let subscribed = false

  async function start() {
    if (subscribed) return
    subscribed = true
    await redisSub.subscribe(...LIVE_CHANNELS)
    redisSub.on('message', (channel, message) => {
      for (const client of clients) {
        client.write(`event: ${channel}\n`)
        client.write(`data: ${message}\n\n`)
      }
    })
  }

  return { start }
}
