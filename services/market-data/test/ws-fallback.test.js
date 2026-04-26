import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFallbackController } from '../src/poll/fallback-controller.js'

test('fallback switches to poll mode after staleness', async () => {
  let fallbackCalled = false
  const fallback = createFallbackController({
    staleAfterMs: 1,
    onFallback: () => {
      fallbackCalled = true
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const mode = fallback.checkStaleness()
  assert.equal(mode, 'poll')
  assert.equal(fallbackCalled, true)
})

test('fallback recovers to ws after update', async () => {
  let recovered = false
  const fallback = createFallbackController({
    staleAfterMs: 1,
    onRecover: () => {
      recovered = true
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  fallback.checkStaleness()
  fallback.markWsUpdate()
  assert.equal(fallback.mode(), 'ws')
  assert.equal(recovered, true)
})
