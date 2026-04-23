import 'dotenv/config'
import IORedis from 'ioredis'
import { Queue, Worker } from 'bullmq'

import { feeds } from './src/feeds.js'
import { createDedup } from './src/dedup.js'
import { createPublisher } from './src/publisher.js'
import { pollFeed } from './src/workers/rss-worker.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const QUEUE_NAME = 'rss-poll'

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ingestion', ...fields }))

// BullMQ connections must have maxRetriesPerRequest: null.
// We keep a second connection for direct commands (xadd, set) so the
// two concerns don't share retry semantics.
const bullConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const dataRedis = new IORedis(REDIS_URL)

const dedup = createDedup(dataRedis)
const publisher = createPublisher(dataRedis)

const pollQueue = new Queue(QUEUE_NAME, { connection: bullConnection })

for (const feed of feeds) {
  await pollQueue.add(
    feed.id,
    { feedId: feed.id },
    {
      repeat: { every: feed.pollIntervalMs },
      jobId: `poll-${feed.id}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  )
  log({ event: 'schedule_registered', feed: feed.id, pollIntervalMs: feed.pollIntervalMs })
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const feed = feeds.find((f) => f.id === job.data.feedId)
    if (!feed) throw new Error(`unknown feed: ${job.data.feedId}`)
    return pollFeed(feed, { dedup, publisher })
  },
  {
    connection: bullConnection,
    concurrency: 5,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  },
)

worker.on('failed', (job, err) => {
  log({ event: 'job_failed', feed: job?.data?.feedId, attempt: job?.attemptsMade, error: err.message })
})

const shutdown = async (signal) => {
  log({ event: 'shutdown_start', signal })
  await worker.close()
  await pollQueue.close()
  await bullConnection.quit()
  await dataRedis.quit()
  log({ event: 'shutdown_complete' })
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log({ event: 'ingestion_started', feed_count: feeds.length })
