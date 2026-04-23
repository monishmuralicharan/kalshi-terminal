import OpenAI from 'openai'

const MODEL = 'text-embedding-3-small'
const DIMS = 1536
const MAX_BATCH = 100

let client

function getClient() {
  if (!client) client = new OpenAI()
  return client
}

export function createEmbedder(opts = {}) {
  const openai = opts.client ?? getClient()
  const model = opts.model ?? MODEL

  async function embed(text) {
    const res = await openai.embeddings.create({ model, input: text })
    return res.data[0].embedding
  }

  async function embedBatch(texts) {
    if (!texts.length) return []
    const out = []
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const chunk = texts.slice(i, i + MAX_BATCH)
      const res = await openai.embeddings.create({ model, input: chunk })
      // OpenAI preserves order; sort by index defensively anyway.
      const sorted = [...res.data].sort((a, b) => a.index - b.index)
      out.push(...sorted.map((d) => d.embedding))
    }
    return out
  }

  return { embed, embedBatch, model, dims: DIMS }
}
