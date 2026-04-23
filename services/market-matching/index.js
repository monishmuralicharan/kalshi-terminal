import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import IORedis from 'ioredis'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../../')
config({ path: resolve(projectRoot, '.env') })
process.env.KALSHI_KEY_BASE_DIR = projectRoot

const { createEmbedder } = await import('./src/matching/embedder.js')
const { createRuleEngine } = await import('./src/matching/rule-engine.js')
const { createVectorSearch } = await import('./src/matching/vector-search.js')
const { createMarketSync } = await import('./src/sync/market-sync.js')
const { createPublisher } = await import('./src/publisher.js')
const { ensureGroup, createConsumer, createMatcher } = await import('./src/consumer.js')

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', ...fields }))

function required(name) {
  if (!process.env[name]) {
    log({ event: 'startup_error', error: `${name} not set` })
    process.exit(1)
  }
}
;['OPENAI_API_KEY', 'KALSHI_API_KEY_ID', 'KALSHI_PRIVATE_KEY_PATH', 'KALSHI_BASE_URL',
  'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'].forEach(required)

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const STREAM = process.env.NLP_ENRICHED_STREAM ?? 'news-enriched'
const GROUP = process.env.MATCHING_CONSUMER_GROUP ?? 'matching-workers'
const CONSUMER_NAME = process.env.MATCHING_CONSUMER_NAME ?? 'worker-1'
const CHANNEL = process.env.REDIS_PUBSUB_CHANNEL ?? 'news-live'
const THRESHOLD = parseFloat(process.env.MATCH_THRESHOLD ?? '0.80')
const SYNC_INTERVAL_MS = Number(process.env.MARKET_SYNC_INTERVAL_MS ?? 300_000)
const SYNC_MAX_PAGES = process.env.MARKET_SYNC_MAX_PAGES ? Number(process.env.MARKET_SYNC_MAX_PAGES) : undefined
const SYNC_CATEGORIES = process.env.MARKET_SYNC_CATEGORIES
  ? process.env.MARKET_SYNC_CATEGORIES.split(',').map((c) => c.trim()).filter(Boolean)
  : null

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
})

const redis = new IORedis(REDIS_URL)

const embedder = createEmbedder()
const ruleEngine = createRuleEngine()
const vectorSearch = createVectorSearch({ pool, threshold: THRESHOLD })
const sync = createMarketSync({
  pool, embedder,
  intervalMs: SYNC_INTERVAL_MS,
  maxPages: SYNC_MAX_PAGES,
  categories: SYNC_CATEGORIES,
})
const publisher = createPublisher({ pool, redis, channel: CHANNEL })
const matcher = createMatcher({ ruleEngine, vectorSearch, embedder })

await ensureGroup(redis, STREAM, GROUP)

const consumer = createConsumer({
  redis, matcher, publisher,
  stream: STREAM, group: GROUP, consumerName: CONSUMER_NAME,
})

const shutdown = async (signal) => {
  log({ event: 'shutdown_start', signal })
  sync.stop()
  consumer.stop()
  setTimeout(async () => {
    try { await redis.quit() } catch {}
    try { await pool.end() } catch {}
    log({ event: 'shutdown_complete' })
    process.exit(0)
  }, 6_000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log({ event: 'market_matching_started', threshold: THRESHOLD, sync_interval_ms: SYNC_INTERVAL_MS })
await Promise.all([sync.loop(), consumer.run()])
