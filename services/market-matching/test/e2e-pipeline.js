import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import IORedis from 'ioredis'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const { createEmbedder } = await import('../src/matching/embedder.js')
const { createRuleEngine } = await import('../src/matching/rule-engine.js')
const { createVectorSearch } = await import('../src/matching/vector-search.js')
const { createPublisher } = await import('../src/publisher.js')
const { createMatcher } = await import('../src/consumer.js')

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379')
const sub = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379')
const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
})

const channel = process.env.REDIS_PUBSUB_CHANNEL ?? 'news-live'
const threshold = parseFloat(process.env.MATCH_THRESHOLD ?? '0.80')

const received = []
await sub.subscribe(channel)
sub.on('message', (ch, msg) => {
  if (ch === channel) received.push(JSON.parse(msg))
})

const embedder = createEmbedder()
const ruleEngine = createRuleEngine()
const vectorSearch = createVectorSearch({ pool, threshold })
const publisher = createPublisher({ pool, redis, channel })
const matcher = createMatcher({ ruleEngine, vectorSearch, embedder })

const articles = [
  {
    id: 'e2e-test:1',
    published_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    source: 'e2e-test',
    url: 'https://example.com/e2e-1',
    title: 'Trump says he may visit Israel next week',
    summary: 'White House weighs Israel trip amid talks.',
    category: 'politics/international',
    urgency: 'breaking',
    sentiment: 0.0,
    entities: { people: ['Donald Trump'], locations: ['Israel'] },
  },
  {
    id: 'e2e-test:2',
    published_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    source: 'e2e-test',
    url: 'https://example.com/e2e-2',
    title: 'Fed officials signal no change to interest rates',
    summary: 'FOMC to hold rates steady through Q2.',
    category: 'finance/macro',
    urgency: 'normal',
    sentiment: 0.1,
    entities: { orgs: ['Federal Reserve'], events: ['FOMC'] },
  },
  {
    id: 'e2e-test:3',
    published_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    source: 'e2e-test',
    url: 'https://example.com/e2e-3',
    title: 'Obscure topic nobody has a market for',
    summary: 'Random irrelevant thing about mushrooms.',
    category: 'other',
    urgency: 'normal',
    sentiment: 0.0,
    entities: {},
  },
]

for (const a of articles) {
  const { market_links, path } = await matcher.matchArticle(a)
  console.log(`[match] id=${a.id} path=${path} links=${market_links.length}`)
  for (const l of market_links) {
    console.log(`  -> ${l.market_id} score=${Number(l.score).toFixed(3)}: ${String(l.title).slice(0, 80)}`)
  }
  await publisher.publish({ ...a, market_links })
}

// Give pub/sub a moment to deliver.
await new Promise((r) => setTimeout(r, 500))

const dbRows = await pool.query(
  `SELECT id, title, urgency, jsonb_array_length(market_links) AS link_count, market_links
   FROM articles WHERE id LIKE 'e2e-test:%' ORDER BY id`,
)
console.log('\n[db] articles rows:')
for (const r of dbRows.rows) {
  console.log(`  id=${r.id} urgency=${r.urgency} links=${r.link_count}`)
}

console.log(`\n[pubsub] received ${received.length} messages on channel '${channel}':`)
for (const m of received) {
  console.log(`  type=${m.type} id=${m.id} links=${(m.market_links || []).length} alert=${m.alert ?? false}`)
}

// Cleanup test rows so the DB stays clean between runs.
await pool.query("DELETE FROM articles WHERE id LIKE 'e2e-test:%'")

await sub.quit()
await redis.quit()
await pool.end()

if (received.length !== articles.length) {
  console.error(`FAIL: expected ${articles.length} pubsub messages, got ${received.length}`)
  process.exit(1)
}
if (dbRows.rows.length !== articles.length) {
  console.error(`FAIL: expected ${articles.length} DB rows, got ${dbRows.rows.length}`)
  process.exit(1)
}
console.log('\nOK')
