import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStackStatus, buildPublicConfig } from '../src/stack-status.js'

test('buildPublicConfig exposes tickers and port only', () => {
  const cfg = buildPublicConfig({
    MARKET_TICKERS: ' A, B ',
    DASHBOARD_API_PORT: '4010',
  })
  assert.deepEqual(cfg.tickers, ['A', 'B'])
  assert.equal(cfg.dashboard_port, 4010)
})

test('buildStackStatus aggregates flags', async () => {
  const pool = {
    async query(sql) {
      if (String(sql).includes('SELECT 1')) return {}
      return { rows: [{ c: 3 }] }
    },
  }
  const redisCmd = {
    async ping() {
      return 'PONG'
    },
    async get() {
      return JSON.stringify({ ws_state: 'live', fallback_mode: 'ws' })
    },
  }
  const body = await buildStackStatus({
    pool,
    redisCmd,
    sseClientsSize: 2,
    env: { MARKET_TICKERS: 'X' },
  })
  assert.equal(body.pg_ok, true)
  assert.equal(body.redis_ok, true)
  assert.equal(body.sse_clients, 2)
  assert.equal(body.recent_event_count, 3)
  assert.deepEqual(body.configured_tickers, ['X'])
  assert.equal(body.market_data.ws_state, 'live')
})
