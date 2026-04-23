import Parser from 'rss-parser'
import { createHash } from 'crypto'

const parser = new Parser({ timeout: 10_000 })

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

export function normalize(item, feed) {
  const link = item.link ?? ''
  return {
    id: `${feed.id}:${hash(link)}`,
    source: feed.id,
    category_hint: feed.category,
    url: link,
    title: item.title?.trim() ?? '',
    body: item.contentSnippet || item.content || item.summary || '',
    published_at: item.isoDate || item.pubDate || new Date().toISOString(),
    ingested_at: new Date().toISOString(),
  }
}

function log(fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ingestion', ...fields }))
}

export async function pollFeed(feed, { dedup, publisher }) {
  const start = Date.now()
  log({ feed: feed.id, event: 'poll_start' })

  let result
  try {
    result = await parser.parseURL(feed.url)
  } catch (err) {
    log({ feed: feed.id, event: 'poll_error', error: err.message, duration_ms: Date.now() - start })
    return { fetched: 0, new_articles: 0 }
  }

  const items = result.items ?? []
  let newArticles = 0

  for (const item of items) {
    const article = normalize(item, feed)
    if (!article.url) continue

    const isNew = await dedup.check(article.url)
    if (!isNew) continue

    await publisher.publish(article)
    newArticles++
  }

  log({
    feed: feed.id,
    event: 'poll_complete',
    fetched: items.length,
    new_articles: newArticles,
    duration_ms: Date.now() - start,
  })

  return { fetched: items.length, new_articles: newArticles }
}
