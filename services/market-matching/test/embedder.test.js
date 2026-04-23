import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmbedder } from '../src/matching/embedder.js'

function fakeClient({ onCall } = {}) {
  const calls = []
  return {
    calls,
    embeddings: {
      create: async ({ input }) => {
        const arr = Array.isArray(input) ? input : [input]
        calls.push(arr.length)
        onCall?.(arr)
        // Return in scrambled order to verify caller sorts by index.
        const data = arr.map((_, i) => ({ index: arr.length - 1 - i, embedding: [i + 1, i + 2, i + 3] }))
        return { data }
      },
    },
  }
}

test('embed returns the single vector', async () => {
  const client = fakeClient()
  const embedder = createEmbedder({ client })
  const vec = await embedder.embed('hello')
  assert.deepEqual(vec, [1, 2, 3])
  assert.deepEqual(client.calls, [1])
})

test('embedBatch splits into <=100-item chunks and preserves input order', async () => {
  const client = fakeClient()
  const embedder = createEmbedder({ client })
  const texts = Array.from({ length: 250 }, (_, i) => `t${i}`)
  const out = await embedder.embedBatch(texts)
  assert.equal(out.length, 250)
  assert.deepEqual(client.calls, [100, 100, 50])
  // Fake scrambles indices; a correct embedBatch sorts by `index` ascending.
  // For a 100-item chunk, index=0 belongs to the loop's last iteration (i=99),
  // whose embedding is [100, 101, 102]. First 100-item chunk therefore yields
  // [100, 101, 102] at position 0.
  assert.deepEqual(out[0], [100, 101, 102])
  // And within the final 50-item chunk (positions 200..249), out[200] should
  // correspond to i=49 in that chunk → [50, 51, 52].
  assert.deepEqual(out[200], [50, 51, 52])
})

test('embedBatch on empty array is a no-op', async () => {
  const client = fakeClient()
  const embedder = createEmbedder({ client })
  const out = await embedder.embedBatch([])
  assert.deepEqual(out, [])
  assert.deepEqual(client.calls, [])
})
