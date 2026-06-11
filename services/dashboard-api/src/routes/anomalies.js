export function createAnomalyRoutes({ pool }) {
  async function listAnomalies({ since, signalType, limit = 100 } = {}) {
    const clauses = ['1=1']
    const params = []
    let idx = 1

    if (since) {
      clauses.push(`detected_at >= $${idx++}`)
      params.push(since)
    }
    if (signalType) {
      clauses.push(`signal_type = $${idx++}`)
      params.push(signalType)
    }

    params.push(Number(limit))
    const sql = `
      SELECT id, detected_at, market_id, window_start, window_end,
             signal_type, score, details, pin_score, acknowledged
      FROM anomalies
      WHERE ${clauses.join(' AND ')}
      ORDER BY detected_at DESC
      LIMIT $${idx}
    `
    const result = await pool.query(sql, params)
    return result.rows
  }

  async function listByMarket(marketId, { limit = 100 } = {}) {
    const result = await pool.query(
      `
      SELECT id, detected_at, market_id, window_start, window_end,
             signal_type, score, details, pin_score, acknowledged
      FROM anomalies
      WHERE market_id = $1
      ORDER BY detected_at DESC
      LIMIT $2
      `,
      [marketId, Number(limit)],
    )
    return result.rows
  }

  return { listAnomalies, listByMarket }
}
