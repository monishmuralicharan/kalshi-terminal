import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMarket, titleHash } from '../src/sync/market-sync.js'

test('normalizeMarket computes bid/ask midpoint from dollar strings', () => {
  const out = normalizeMarket({
    ticker: 'FED-25-MAY-HIKE',
    title: 'Will the Fed hike in May?',
    yes_bid_dollars: '0.70',
    yes_ask_dollars: '0.72',
    status: 'active',
    close_time: '2026-05-31T23:59:00Z',
  })
  assert.equal(out.id, 'FED-25-MAY-HIKE')
  assert.equal(out.title, 'Will the Fed hike in May?')
  assert.equal(out.yes_price, 0.71)
  assert.equal(out.is_open, true)
  assert.equal(out.closes_at, '2026-05-31T23:59:00Z')
})

test('normalizeMarket marks non-active markets closed', () => {
  const out = normalizeMarket({
    ticker: 'X',
    title: 'x',
    yes_bid_dollars: '0.00',
    yes_ask_dollars: '0.00',
    status: 'closed',
  })
  assert.equal(out.is_open, false)
})

test('normalizeMarket handles missing price fields', () => {
  const out = normalizeMarket({ ticker: 'X', title: 'x', status: 'active' })
  assert.equal(out.yes_price, 0)
})

test('titleHash stable for same title, differs for different', () => {
  assert.equal(titleHash('Fed hike'), titleHash('Fed hike'))
  assert.notEqual(titleHash('Fed hike'), titleHash('Fed pause'))
})
