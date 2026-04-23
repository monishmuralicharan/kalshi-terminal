const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'nlp-worker', ...fields }))

export async function ensureGroup(redis, stream, group) {
  try {
    await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM')
    log({ event: 'group_created', stream, group })
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err
    log({ event: 'group_exists', stream, group })
  }
}

function decodeMessages(messages) {
  return messages.map(([streamId, fields]) => {
    // fields = ['data', '{...}'] — key at index 0, value at index 1
    const article = JSON.parse(fields[1])
    return { streamId, ...article }
  })
}

export function createConsumer({
  redis,
  enricher,
  publisher,
  stream,
  group,
  consumerName,
  batchSize,
  blockMs = 5_000,
  failedStream = 'news-failed',
}) {
  let running = true

  async function deadLetter(articles, reason) {
    for (const a of articles) {
      const payload = { ...a, failure_reason: reason, failed_at: new Date().toISOString() }
      delete payload.streamId
      try {
        await redis.xadd(
          failedStream,
          'MAXLEN', '~', 10_000,
          '*',
          'data', JSON.stringify(payload),
        )
      } catch (err) {
        log({ event: 'dead_letter_write_failed', error: err.message, article_id: a.id })
      }
      await redis.xack(stream, group, a.streamId)
    }
    log({ event: 'dead_lettered', count: articles.length, reason })
  }

  async function publishAndAck(article, enrichment) {
    const enriched = { ...article, ...enrichment }
    delete enriched.streamId
    await publisher.publish(enriched)
    await redis.xack(stream, group, article.streamId)
  }

  async function processOneByOne(articles, originalError) {
    log({ event: 'fallback_per_article', count: articles.length, reason: originalError?.message })
    const stillFailed = []
    for (const article of articles) {
      try {
        const enrichment = await enricher.enrichOne(article)
        await publishAndAck(article, enrichment)
      } catch (err) {
        log({ event: 'enrich_single_failed', article_id: article.id, error: err.message })
        stillFailed.push(article)
      }
    }
    if (stillFailed.length) await deadLetter(stillFailed, 'single_enrichment_failed')
  }

  async function processBatch(articles) {
    const start = Date.now()
    let enrichments
    try {
      ;({ enrichments } = await enricher.enrichBatch(articles))
    } catch (err) {
      // Batch failed after retries — try per-article as a last resort.
      await processOneByOne(articles, err)
      return
    }

    for (let i = 0; i < articles.length; i++) {
      await publishAndAck(articles[i], enrichments[i])
    }
    log({
      event: 'batch_complete',
      batch_size: articles.length,
      duration_ms: Date.now() - start,
    })
  }

  async function run() {
    log({ event: 'consumer_started', stream, group, consumer: consumerName, batchSize })

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

      if (!response) continue // BLOCK timeout

      const [, messages] = response[0]
      if (!messages?.length) continue

      let articles
      try {
        articles = decodeMessages(messages)
      } catch (err) {
        // Malformed stream entry — ack so it doesn't block the queue.
        log({ event: 'decode_failed', error: err.message, count: messages.length })
        for (const [id] of messages) await redis.xack(stream, group, id)
        continue
      }

      await processBatch(articles)
    }

    log({ event: 'consumer_stopped' })
  }

  function stop() {
    running = false
  }

  return { run, stop }
}
