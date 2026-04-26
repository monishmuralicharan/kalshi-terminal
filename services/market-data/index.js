import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import IORedis from 'ioredis'
import pg from 'pg'
import { buildPgPoolConfig, getDbConfigInfo } from '../common/db/pg-config.js'

import { createMetrics } from './src/observability/metrics.js'
import { createHealth } from './src/health/health.js'
import { createBookStore } from './src/state/book-store.js'
import { createRedisPublisher } from './src/publish/redis-publisher.js'
import { createPostgresWriter } from './src/persist/postgres-writer.js'
import { createOrderbookReconciler } from './src/reconcile/orderbook-reconciler.js'
import { createSubscriptionManager } from './src/ws/subscription-manager.js'
import { createKalshiWsClient } from './src/ws/kalshi-ws-client.js'
import { createMarketSnapshotPoller } from './src/poll/market-snapshot-poller.js'
import { createFallbackController } from './src/poll/fallback-controller.js'
import { normalizeKalshiEvent } from './src/normalize/kalshi-normalizer.js'
import { validateCanonicalEvent } from './src/validate/event-validator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })
process.env.KALSHI_KEY_BASE_DIR = resolve(__dirname, '../../')

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-data', ...fields }))

function required(name) {
  if (!process.env[name]) throw new Error(`${name} not set`)
}

;[
  'KALSHI_API_KEY_ID',
  'KALSHI_PRIVATE_KEY_PATH',
  'KALSHI_BASE_URL',
].forEach(required)

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const KALSHI_WS_URL = process.env.KALSHI_WS_URL ?? ''
const MARKET_TICKERS = (process.env.MARKET_TICKERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const POLL_INTERVAL_MS = Number(process.env.MARKET_POLL_INTERVAL_MS ?? 5000)

const redis = new IORedis(REDIS_URL)
const pool = new pg.Pool(buildPgPoolConfig(process.env))

const metrics = createMetrics()
const store = createBookStore()
const publisher = createRedisPublisher(redis)
const writer = createPostgresWriter(pool)
const poller = createMarketSnapshotPoller({ tickers: MARKET_TICKERS })
const wsStateRef = { current: 'idle' }
const fallback = createFallbackController({
  staleAfterMs: Number(process.env.MARKET_WS_STALE_MS ?? 15000),
  onFallback: () => log({ event: 'fallback_entered' }),
  onRecover: () => log({ event: 'fallback_cleared' }),
})
const reconciler = createOrderbookReconciler({
  onGap: ({ market_ticker, expected, got }) => {
    metrics.inc('sequence_gaps')
    log({ event: 'sequence_gap', market_ticker, expected, got })
  },
})
const health = createHealth({ fallbackController: fallback, wsStateRef })

async function handleEvent(canonicalEvent) {
  validateCanonicalEvent(canonicalEvent)
  const { accepted } = reconciler.reconcile(canonicalEvent)
  if (!accepted) {
    metrics.inc('dropped_events')
    return
  }
  const state = store.upsert(canonicalEvent)
  await writer.appendEvent(canonicalEvent)
  await writer.saveCurrent(state)
  await publisher.publish(canonicalEvent)
  metrics.inc(`event_${canonicalEvent.type}`)
  metrics.setGauge(`market_lag_ms_${canonicalEvent.meta.market_ticker}`, Date.now() - Date.parse(canonicalEvent.meta.provider_ts))
}

let running = true
let wsClient

if (KALSHI_WS_URL && MARKET_TICKERS.length) {
  const subscriptionManager = createSubscriptionManager({ tickers: MARKET_TICKERS })
  wsClient = createKalshiWsClient({
    wsUrl: KALSHI_WS_URL,
    subscriptionManager,
    onStateChange: (state) => {
      wsStateRef.current = state
      log({ event: 'ws_state', state })
    },
    onMessage: async (data) => {
      try {
        const raw = JSON.parse(data)
        const canonical = normalizeKalshiEvent(raw, { source: 'ws' })
        await handleEvent(canonical)
        fallback.markWsUpdate()
      } catch (error) {
        metrics.inc('ws_parse_errors')
        log({ event: 'ws_message_error', error: error.message })
      }
    },
  })
  wsClient.start().catch((error) => log({ event: 'ws_fatal', error: error.message }))
}

async function pollLoop() {
  while (running) {
    try {
      if (fallback.checkStaleness() === 'poll') {
        const events = await poller.pollAll()
        for (const event of events) await handleEvent(event)
      }
    } catch (error) {
      metrics.inc('poll_errors')
      log({ event: 'poll_error', error: error.message })
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

pollLoop().catch((error) => log({ event: 'poll_fatal', error: error.message }))

const reportTimer = setInterval(() => {
  log({ event: 'metrics', ...metrics.snapshot(), health: health.ready() })
}, 30_000)
reportTimer.unref()

const shutdown = async (signal) => {
  running = false
  log({ event: 'shutdown_start', signal })
  wsClient?.stop()
  clearInterval(reportTimer)
  await redis.quit()
  await pool.end()
  log({ event: 'shutdown_complete' })
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log({
  event: 'market_data_started',
  tickers: MARKET_TICKERS.length,
  has_ws: Boolean(KALSHI_WS_URL),
  ...getDbConfigInfo(process.env),
  health: health.live(),
})
