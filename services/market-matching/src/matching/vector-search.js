import pgvector from 'pgvector/pg'

export function createVectorSearch({ pool, threshold, topK = 5 }) {
  async function findSimilar(embedding) {
    const vec = pgvector.toSql(embedding)
    const res = await pool.query(
      `SELECT id AS market_id, title, yes_price,
              1 - (embedding <=> $1::vector) AS score
       FROM markets
       WHERE is_open = true AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vec, topK],
    )
    return res.rows
      .filter((r) => Number(r.score) >= threshold)
      .map((r) => ({
        market_id: r.market_id,
        title: r.title,
        yes_price: Number(r.yes_price),
        score: Number(r.score),
      }))
  }

  async function getByIds(ids) {
    if (!ids?.length) return []
    const res = await pool.query(
      `SELECT id AS market_id, title, yes_price
       FROM markets
       WHERE id = ANY($1::text[])`,
      [ids],
    )
    return res.rows.map((r) => ({
      market_id: r.market_id,
      title: r.title,
      yes_price: Number(r.yes_price),
      score: 1.0,
    }))
  }

  return { findSimilar, getByIds }
}
