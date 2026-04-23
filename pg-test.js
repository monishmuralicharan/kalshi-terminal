import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
})

const res = await pool.query('SELECT NOW()')
console.log(res.rows[0])  // { now: 2026-04-23T... }
await pool.end()