import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRuleEngine } from '../src/matching/rule-engine.js'

test('returns the market ids for the first matching rule', () => {
  const engine = createRuleEngine([
    { keywords: ['fed', 'fomc'], markets: ['FED-RATE'] },
    { keywords: ['cpi'], markets: ['CPI'] },
  ])
  const out = engine.match({ title: 'FOMC raises rates', summary: '' })
  assert.deepEqual(out, ['FED-RATE'])
})

test('matches are case insensitive and check summary and body', () => {
  const engine = createRuleEngine([{ keywords: ['inflation'], markets: ['CPI'] }])
  assert.deepEqual(engine.match({ title: '', summary: '', body: 'INFLATION eased' }), ['CPI'])
})

test('returns null when no rule matches', () => {
  const engine = createRuleEngine([{ keywords: ['fed'], markets: ['X'] }])
  assert.equal(engine.match({ title: 'sports news', summary: '' }), null)
})

test('first rule wins when multiple could match', () => {
  const engine = createRuleEngine([
    { keywords: ['fed'], markets: ['A'] },
    { keywords: ['fed'], markets: ['B'] },
  ])
  assert.deepEqual(engine.match({ title: 'Fed', summary: '' }), ['A'])
})
