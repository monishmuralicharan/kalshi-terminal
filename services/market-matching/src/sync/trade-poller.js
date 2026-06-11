import { kalshiGet } from '../kalshi/client.js'

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', stage: 'trade-poller', ...fields }))

function normalizeTrade(raw, marketId) {
  return {
    trade_id: raw.trade_id,
    market_id: marketId,
    time: raw.created_time,
    price: raw.yes_price / 100,
    size: raw.count,
    direction: raw.taker_side,
  }
}

export function createTradePoller({
  pool,
  pollIntervalMs = Number(process.env.TRADE_POLL_INTERVAL_MS ?? 60_000),
  tradesPerMarket = Number(process.env.TRADES_PER_MARKET_FETCH ?? 100),
  concurrency = Number(process.env.TRADE_POLL_CONCURRENCY ?? 10),
}) {
  let stopped = false
  let timer = null

  async function getOpenMarketIds() {
    const result = await pool.query('SELECT id FROM markets WHERE is_open = true ORDER BY id')
    return result.rows.map((r) => r.id)
  }

  async function fetchTrades(marketId) {
    const path = `/trade-api/v2/markets/${marketId}/trades?limit=${tradesPerMarket}`
    const data = await kalshiGet(path)
    return data.trades ?? []
  }

  async function insertTrades(trades) {
    if (trades.length === 0) return 0

    const values = []
    const params = []
    let idx = 1

    for (const t of trades) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`)
      params.push(t.time, t.trade_id, t.market_id, t.price, t.size, t.direction)
    }

    const sql = `
      INSERT INTO trades (time, trade_id, market_id, price, size, direction)
      VALUES ${values.join(', ')}
      ON CONFLICT (time, trade_id) DO NOTHING
    `

    const result = await pool.query(sql, params)
    return result.rowCount
  }

  async function pollMarket(marketId) {
    const raw = await fetchTrades(marketId)
    const trades = raw.map((t) => normalizeTrade(t, marketId))
    return insertTrades(trades)
  }

  async function runPollCycle() {
    const start = Date.now()
    const marketIds = await getOpenMarketIds()

    let totalInserted = 0
    let errors = 0

    for (let i = 0; i < marketIds.length; i += concurrency) {
      const chunk = marketIds.slice(i, i + concurrency)
      const results = await Promise.allSettled(chunk.map((id) => pollMarket(id)))

      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          totalInserted += result.value
        } else {
          errors++
          log({
            event: 'poll_error',
            market_id: chunk[j],
            error: result.reason?.message,
          })
        }
      }
    }

    log({
      event: 'poll_cycle_complete',
      markets_polled: marketIds.length,
      new_trades: totalInserted,
      errors,
      duration_ms: Date.now() - start,
    })
  }

  async function pollLoop() {
    if (stopped) return
    try {
      await runPollCycle()
    } catch (err) {
      log({ event: 'poll_loop_error', error: err.message })
    } finally {
      if (!stopped) {
        timer = setTimeout(pollLoop, pollIntervalMs)
        timer.unref?.()
      }
    }
  }

  function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
  }

  return { pollLoop, runPollCycle, stop }
}
