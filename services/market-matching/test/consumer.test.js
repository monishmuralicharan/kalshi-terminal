import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMatcher } from '../src/consumer.js'

test('matchArticle takes the rule path and skips embedding when a rule fires', async () => {
  let embedCalls = 0
  const matcher = createMatcher({
    ruleEngine: { match: () => ['FED-RATE'] },
    vectorSearch: {
      findSimilar: async () => { throw new Error('should not be called') },
      getByIds: async (ids) => ids.map((id) => ({ market_id: id, title: 't', yes_price: 0.5, score: 1 })),
    },
    embedder: { embed: async () => { embedCalls++; return [] } },
  })
  const out = await matcher.matchArticle({ title: 'Fed raises rates', summary: '' })
  assert.equal(out.path, 'rule')
  assert.deepEqual(out.market_links, [{ market_id: 'FED-RATE', title: 't', yes_price: 0.5, score: 1 }])
  assert.equal(embedCalls, 0)
})

test('matchArticle falls through to vector search when rule IDs are not in DB', async () => {
  const matcher = createMatcher({
    ruleEngine: { match: () => ['STALE-ID'] },
    vectorSearch: {
      getByIds: async () => [],
      findSimilar: async () => [{ market_id: 'X', title: 'x', yes_price: 0.4, score: 0.85 }],
    },
    embedder: { embed: async () => [0.1, 0.2] },
  })
  const out = await matcher.matchArticle({ title: 'Fed raises rates', summary: 's' })
  assert.equal(out.path, 'vector')
  assert.equal(out.market_links[0].market_id, 'X')
})

test('matchArticle falls through to embedding + vector search when no rule matches', async () => {
  const matcher = createMatcher({
    ruleEngine: { match: () => null },
    vectorSearch: {
      findSimilar: async (vec) => {
        assert.deepEqual(vec, [0.1, 0.2])
        return [{ market_id: 'X', title: 'x', yes_price: 0.4, score: 0.91 }]
      },
      getByIds: async () => { throw new Error('should not be called') },
    },
    embedder: { embed: async () => [0.1, 0.2] },
  })
  const out = await matcher.matchArticle({ title: 'random news', summary: 'details' })
  assert.equal(out.path, 'vector')
  assert.equal(out.market_links[0].score, 0.91)
})

test('matchArticle returns empty market_links on empty title+summary', async () => {
  const matcher = createMatcher({
    ruleEngine: { match: () => null },
    vectorSearch: { findSimilar: async () => [], getByIds: async () => [] },
    embedder: { embed: async () => { throw new Error('should not be called') } },
  })
  const out = await matcher.matchArticle({ title: '', summary: '' })
  assert.equal(out.path, 'empty')
  assert.deepEqual(out.market_links, [])
})
