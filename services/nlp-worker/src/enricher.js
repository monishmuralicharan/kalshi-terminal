import OpenAI from 'openai'

const MODEL = 'gpt-4o-mini'
const BODY_SLICE = 500
const API_RETRY_DELAYS_MS = [2_000, 4_000]

export const SYSTEM_PROMPT = `You are a news classification assistant for a prediction market terminal.

You will receive a JSON array of news articles. For each article, return a JSON array
of enrichment objects in the SAME ORDER as the input.

Each object must have exactly these fields:
- category: one of "politics/us", "politics/international", "finance/macro",
  "finance/markets", "finance/earnings", "legal", "geopolitics",
  "science/health", "technology", "other"
- entities: object with arrays "orgs", "people", "events", "locations"
- sentiment: float from -1.0 (very negative) to 1.0 (very positive)
- urgency: one of "breaking", "developing", "normal"
- summary: one sentence, max 15 words, describing the key fact

Return ONLY the JSON array. No markdown. No explanation. No code fences.`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function buildUserMessage(articles) {
  return JSON.stringify(
    articles.map((a) => ({
      title: a.title ?? '',
      body: (a.body ?? '').slice(0, BODY_SLICE),
    })),
  )
}

export function parseEnrichment(raw, articleCount) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${String(raw).slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array, got: ${typeof parsed}`)
  }
  if (parsed.length !== articleCount) {
    throw new Error(`Expected ${articleCount} items, got ${parsed.length}`)
  }
  return parsed
}

export function createEnricher(opts = {}) {
  const client = opts.client ?? new OpenAI()
  const model = opts.model ?? MODEL

  async function callOnce(articles) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(articles) },
      ],
    })
    return response.choices[0]?.message?.content ?? ''
  }

  async function enrichBatch(articles) {
    let lastErr
    for (let attempt = 0; attempt <= API_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const raw = await callOnce(articles)
        return { raw, enrichments: parseEnrichment(raw, articles.length) }
      } catch (err) {
        lastErr = err
        const delay = API_RETRY_DELAYS_MS[attempt]
        if (delay == null) break
        await sleep(delay)
      }
    }
    throw lastErr
  }

  // Per-article fallback when batch enrichment returns a length mismatch
  // or fails repeatedly. Each call returns a single-element array.
  async function enrichOne(article) {
    const { enrichments } = await enrichBatch([article])
    return enrichments[0]
  }

  return { enrichBatch, enrichOne, model }
}
