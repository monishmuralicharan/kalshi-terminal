const STATUS_KEY = 'kalshi-terminal:market-data:status'

export async function buildStackStatus({ pool, redisCmd, sseClientsSize, env = process.env }) {
  const configuredTickers = (env.MARKET_TICKERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  let pgOk = false
  try {
    await pool.query('SELECT 1')
    pgOk = true
  } catch {
    pgOk = false
  }

  let redisOk = false
  try {
    const pong = await redisCmd.ping()
    redisOk = pong === 'PONG'
  } catch {
    redisOk = false
  }

  let marketData = null
  try {
    const raw = await redisCmd.get(STATUS_KEY)
    marketData = raw ? JSON.parse(raw) : null
  } catch {
    marketData = null
  }

  let recentEventCount = 0
  try {
    const res = await pool.query(
      `SELECT count(*)::int AS c FROM market_events WHERE ingest_ts > now() - interval '1 minute'`,
    )
    recentEventCount = res.rows[0]?.c ?? 0
  } catch {
    recentEventCount = 0
  }

  return {
    ts: new Date().toISOString(),
    pg_ok: pgOk,
    redis_ok: redisOk,
    sse_clients: sseClientsSize,
    market_data: marketData,
    recent_event_count: recentEventCount,
    configured_tickers: configuredTickers,
  }
}

export function buildPublicConfig(env = process.env) {
  return {
    tickers: (env.MARKET_TICKERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    dashboard_port: Number(env.DASHBOARD_API_PORT ?? 4010),
  }
}
