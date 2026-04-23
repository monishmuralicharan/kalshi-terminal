const STREAM_KEY = 'news-raw'
const MAX_LEN = 10_000

export function createPublisher(redis) {
  return {
    async publish(article) {
      await redis.xadd(
        STREAM_KEY,
        'MAXLEN', '~', MAX_LEN,
        '*',
        'data', JSON.stringify(article),
      )
    },
  }
}
