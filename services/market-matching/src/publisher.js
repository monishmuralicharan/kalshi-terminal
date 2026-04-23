const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', stage: 'publish', ...fields }))

export function createPublisher({ pool, redis, channel }) {
  async function saveArticle(article) {
    await pool.query(
      `INSERT INTO articles
         (id, published_at, ingested_at, source, url, title, summary,
          category, urgency, sentiment, entities, market_links)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id, published_at) DO NOTHING`,
      [
        article.id,
        article.published_at,
        article.ingested_at,
        article.source,
        article.url,
        article.title,
        article.summary,
        article.category,
        article.urgency,
        article.sentiment,
        JSON.stringify(article.entities ?? {}),
        JSON.stringify(article.market_links ?? []),
      ],
    )
  }

  async function publishLive(article) {
    const payload = { type: 'article', ...article }
    // Alert flag for breaking + high-score match (PRD §5.8).
    const topScore = (article.market_links ?? []).reduce((m, l) => Math.max(m, l.score ?? 0), 0)
    if (article.urgency === 'breaking' && topScore >= 0.90) payload.alert = true
    const subs = await redis.publish(channel, JSON.stringify(payload))
    return subs
  }

  async function publish(article) {
    const start = Date.now()
    await saveArticle(article)
    const subscribers = await publishLive(article)
    log({
      event: 'article_published',
      article_id: article.id,
      market_links: (article.market_links ?? []).length,
      subscribers,
      duration_ms: Date.now() - start,
    })
  }

  return { saveArticle, publishLive, publish }
}
