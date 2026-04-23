const DEFAULT_STREAM = 'news-enriched'
const DEFAULT_MAX_LEN = 10_000

export function createPublisher(redis, opts = {}) {
  const stream = opts.stream ?? process.env.NEWS_ENRICHED_STREAM ?? DEFAULT_STREAM
  const maxLen = Number(opts.maxLen ?? process.env.REDIS_STREAM_MAXLEN ?? DEFAULT_MAX_LEN)

  return {
    stream,
    async publish(article) {
      await redis.xadd(
        stream,
        'MAXLEN', '~', maxLen,
        '*',
        'data', JSON.stringify(article),
      )
    },
  }
}
