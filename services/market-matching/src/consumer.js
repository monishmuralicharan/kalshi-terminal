const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', stage: 'consumer', ...fields }))

export async function ensureGroup(redis, stream, group) {
  try {
    await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM')
    log({ event: 'group_created', stream, group })
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err
    log({ event: 'group_exists', stream, group })
  }
}

export function createMatcher({ ruleEngine, vectorSearch, embedder }) {
  async function matchArticle(article) {
    const ruleMatches = ruleEngine.match(article)
    if (ruleMatches?.length) {
      const links = await vectorSearch.getByIds(ruleMatches)
      if (links.length) return { market_links: links, path: 'rule' }
      // Rule pointed at market IDs that don't exist — fall through to vector search.
    }
    const text = `${article.title ?? ''} ${article.summary ?? ''}`.trim()
    if (!text) return { market_links: [], path: 'empty' }
    const embedding = await embedder.embed(text)
    const links = await vectorSearch.findSimilar(embedding)
    return { market_links: links, path: 'vector' }
  }
  return { matchArticle }
}

export function createConsumer({
  redis,
  matcher,
  publisher,
  stream,
  group,
  consumerName,
  batchSize = 10,
  blockMs = 5_000,
  failedStream = 'news-matching-failed',
}) {
  let running = true

  async function deadLetter(streamId, payload, reason) {
    try {
      await redis.xadd(
        failedStream,
        'MAXLEN', '~', 10_000,
        '*',
        'data', JSON.stringify({ ...payload, failure_reason: reason, failed_at: new Date().toISOString() }),
      )
    } catch (err) {
      log({ event: 'dead_letter_write_failed', error: err.message })
    }
    await redis.xack(stream, group, streamId)
  }

  async function processOne(streamId, article) {
    const start = Date.now()
    try {
      const { market_links, path } = await matcher.matchArticle(article)
      const enriched = { ...article, market_links }
      delete enriched.streamId
      await publisher.publish(enriched)
      await redis.xack(stream, group, streamId)
      log({
        event: 'article_matched',
        article_id: article.id,
        path,
        market_links: market_links.length,
        duration_ms: Date.now() - start,
      })
    } catch (err) {
      log({ event: 'match_failed', article_id: article.id, error: err.message })
      await deadLetter(streamId, article, err.message)
    }
  }

  async function run() {
    log({ event: 'consumer_started', stream, group, consumer: consumerName })

    while (running) {
      let response
      try {
        response = await redis.xreadgroup(
          'GROUP', group, consumerName,
          'COUNT', batchSize,
          'BLOCK', blockMs,
          'STREAMS', stream, '>',
        )
      } catch (err) {
        log({ event: 'xreadgroup_error', error: err.message })
        await new Promise((r) => setTimeout(r, 1_000))
        continue
      }

      if (!response) continue
      const [, messages] = response[0]
      if (!messages?.length) continue

      for (const [streamId, fields] of messages) {
        let article
        try {
          article = JSON.parse(fields[1])
        } catch (err) {
          log({ event: 'decode_failed', stream_id: streamId, error: err.message })
          await redis.xack(stream, group, streamId)
          continue
        }
        await processOne(streamId, article)
      }
    }

    log({ event: 'consumer_stopped' })
  }

  function stop() { running = false }

  return { run, stop }
}
