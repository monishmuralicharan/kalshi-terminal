import { createHash } from 'crypto'
import pgvector from 'pgvector/pg'
import { kalshiGet } from '../kalshi/client.js'

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', stage: 'sync', ...fields }))

export function titleHash(title) {
  return createHash('md5').update(title || '').digest('hex').slice(0, 16)
}

export function normalizeMarket(raw) {
  const bid = parseFloat(raw.yes_bid_dollars ?? '0')
  const ask = parseFloat(raw.yes_ask_dollars ?? '0')
  const yesPrice = (bid + ask) / 2
  return {
    id: raw.ticker,
    title: (raw.title ?? '').trim(),
    yes_price: Number.isFinite(yesPrice) ? yesPrice : 0,
    is_open: raw.status === 'active',
    closes_at: raw.close_time ?? null,
  }
}

export async function fetchAllOpenMarkets({ maxPages = Infinity, pageSize = 1000 } = {}) {
  const markets = []
  let cursor = ''
  let pages = 0
  do {
    const q = `status=open&limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`
    const data = await kalshiGet(`/trade-api/v2/markets?${q}`)
    for (const raw of data.markets ?? []) markets.push(raw)
    cursor = data.cursor
    pages++
  } while (cursor && pages < maxPages)
  return markets
}

export async function fetchMarketsByCategory(category, { maxPages = Infinity, pageSize = 200 } = {}) {
  const markets = []
  let cursor = ''
  let pages = 0
  do {
    const q = `status=open&with_nested_markets=true&category=${encodeURIComponent(category)}&limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`
    const data = await kalshiGet(`/trade-api/v2/events?${q}`)
    for (const ev of data.events ?? []) {
      for (const m of ev.markets ?? []) markets.push(m)
    }
    cursor = data.cursor
    pages++
  } while (cursor && pages < maxPages)
  return markets
}

async function loadExistingTitles(pool) {
  const res = await pool.query('SELECT id, title FROM markets')
  const byId = new Map()
  for (const row of res.rows) byId.set(row.id, titleHash(row.title))
  return byId
}

export function createMarketSync({ pool, embedder, maxPages, intervalMs, categories = null }) {
  async function upsertMarket(m, embedding) {
    await pool.query(
      `INSERT INTO markets (id, title, yes_price, is_open, closes_at, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         yes_price = EXCLUDED.yes_price,
         is_open = EXCLUDED.is_open,
         closes_at = EXCLUDED.closes_at,
         embedding = COALESCE(EXCLUDED.embedding, markets.embedding)`,
      [
        m.id,
        m.title,
        m.yes_price,
        m.is_open,
        m.closes_at,
        embedding ? pgvector.toSql(embedding) : null,
      ],
    )
  }

  async function fetchSource() {
    if (categories?.length) {
      const all = []
      const seen = new Set()
      for (const cat of categories) {
        const rows = await fetchMarketsByCategory(cat, { maxPages })
        for (const r of rows) {
          if (r.ticker && !seen.has(r.ticker)) {
            seen.add(r.ticker)
            all.push(r)
          }
        }
      }
      return all
    }
    return fetchAllOpenMarkets({ maxPages })
  }

  async function runSync() {
    const start = Date.now()
    const raws = await fetchSource()
    const normalized = raws.map(normalizeMarket).filter((m) => m.id && m.title)

    const existing = await loadExistingTitles(pool)

    // Find the subset whose title is new or changed — these need embeddings.
    const needEmbed = []
    for (const m of normalized) {
      if (existing.get(m.id) !== titleHash(m.title)) needEmbed.push(m)
    }

    log({
      event: 'sync_plan',
      fetched: raws.length,
      to_upsert: normalized.length,
      to_embed: needEmbed.length,
    })

    // Embed in bulk.
    const titleToEmbedding = new Map()
    if (needEmbed.length) {
      const embeddings = await embedder.embedBatch(needEmbed.map((m) => m.title))
      needEmbed.forEach((m, i) => titleToEmbedding.set(m.id, embeddings[i]))
    }

    // Upsert every normalized market. Price+status always refresh; embedding only
    // updates when the title changed (COALESCE keeps the old vector otherwise).
    let upserted = 0
    for (const m of normalized) {
      await upsertMarket(m, titleToEmbedding.get(m.id))
      upserted++
    }

    log({
      event: 'sync_complete',
      upserted,
      embedded: needEmbed.length,
      duration_ms: Date.now() - start,
    })
    return { fetched: raws.length, upserted, embedded: needEmbed.length }
  }

  let running = true
  async function loop() {
    while (running) {
      try {
        await runSync()
      } catch (err) {
        log({ event: 'sync_error', error: err.message })
      }
      if (!running) break
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }

  function stop() {
    running = false
  }

  return { runSync, loop, stop }
}
