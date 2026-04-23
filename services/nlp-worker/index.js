import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import IORedis from 'ioredis'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const { createEnricher } = await import('./src/enricher.js')
const { createPublisher } = await import('./src/publisher.js')
const { ensureGroup, createConsumer } = await import('./src/consumer.js')

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const INPUT_STREAM = process.env.REDIS_STREAM_NAME ?? 'news-raw'
const GROUP = 'nlp-workers'
const CONSUMER_NAME = process.env.NLP_CONSUMER_NAME ?? 'worker-1'
const BATCH_SIZE = Number(process.env.NLP_BATCH_SIZE ?? 10)

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'nlp-worker', ...fields }))

if (!process.env.OPENAI_API_KEY) {
  log({ event: 'startup_error', error: 'OPENAI_API_KEY not set' })
  process.exit(1)
}

const redis = new IORedis(REDIS_URL)

await ensureGroup(redis, INPUT_STREAM, GROUP)

const enricher = createEnricher()
const publisher = createPublisher(redis)

const consumer = createConsumer({
  redis,
  enricher,
  publisher,
  stream: INPUT_STREAM,
  group: GROUP,
  consumerName: CONSUMER_NAME,
  batchSize: BATCH_SIZE,
})

const shutdown = async (signal) => {
  log({ event: 'shutdown_start', signal })
  consumer.stop()
  // Give the in-flight xreadgroup up to its BLOCK window to return,
  // then close the connection.
  setTimeout(async () => {
    try {
      await redis.quit()
    } catch {}
    log({ event: 'shutdown_complete' })
    process.exit(0)
  }, 6_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log({ event: 'nlp_worker_started', model: enricher.model, batch_size: BATCH_SIZE })
await consumer.run()
