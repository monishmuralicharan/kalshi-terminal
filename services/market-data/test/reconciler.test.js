import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOrderbookReconciler } from '../src/reconcile/orderbook-reconciler.js'

test('reconciler accepts first event without sequence', () => {
  const reconciler = createOrderbookReconciler({})
  const out = reconciler.reconcile({
    meta: { market_ticker: 'FED-TEST', sequence: null },
    type: 'ticker_update',
  })
  assert.equal(out.accepted, true)
})

test('reconciler drops out-of-order sequence', () => {
  const reconciler = createOrderbookReconciler({})
  reconciler.reconcile({
    meta: { market_ticker: 'FED-TEST', sequence: 10 },
    type: 'book_delta',
  })
  const out = reconciler.reconcile({
    meta: { market_ticker: 'FED-TEST', sequence: 9 },
    type: 'book_delta',
  })
  assert.equal(out.accepted, false)
  assert.equal(out.reason, 'out_of_order')
})

test('reconciler reports sequence gaps for deltas', () => {
  let called = false
  const reconciler = createOrderbookReconciler({
    onGap: ({ expected, got }) => {
      called = expected === 2 && got === 4
    },
  })
  reconciler.reconcile({
    meta: { market_ticker: 'FED-TEST', sequence: 1 },
    type: 'book_delta',
  })
  const out = reconciler.reconcile({
    meta: { market_ticker: 'FED-TEST', sequence: 4 },
    type: 'book_delta',
  })
  assert.equal(out.accepted, true)
  assert.equal(called, true)
})
