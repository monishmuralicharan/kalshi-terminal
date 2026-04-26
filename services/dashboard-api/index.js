import { config } from 'dotenv'
import { createServer } from 'http'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import IORedis from 'ioredis'
import pg from 'pg'
import { buildPgPoolConfig, getDbConfigInfo } from '../common/db/pg-config.js'

import { createBookStore } from '../market-data/src/state/book-store.js'
import { createMarketRoutes } from './src/routes/markets.js'
import { createLiveStream } from './src/stream/live-stream.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const PORT = Number(process.env.DASHBOARD_API_PORT ?? 4010)

const pool = new pg.Pool(buildPgPoolConfig(process.env))

const cache = createBookStore()
const redisSub = new IORedis(REDIS_URL)
const clients = new Set()
const liveStream = createLiveStream({ redisSub, clients })
const routes = createMarketRoutes({ pool, cache })

await liveStream.start()

const parseJsonBody = (req) =>
  new Promise((resolveBody) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolveBody(data ? JSON.parse(data) : {})
      } catch {
        resolveBody({})
      }
    })
  })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/health/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/health/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, clients: clients.size, ts: new Date().toISOString() }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/markets') {
    const markets = await routes.listMarkets()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ markets }))
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/markets/') && url.pathname.endsWith('/snapshot')) {
    const ticker = decodeURIComponent(url.pathname.split('/')[2] ?? '')
    const snapshot = await routes.getSnapshot(ticker)
    if (!snapshot) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ snapshot }))
    return
  }

  if (req.method === 'POST' && url.pathname.startsWith('/markets/') && url.pathname.endsWith('/events')) {
    const ticker = decodeURIComponent(url.pathname.split('/')[2] ?? '')
    const body = await parseJsonBody(req)
    const events = await routes.getRecentEvents(ticker, Number(body.limit ?? 200))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ events }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    })
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
})

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'dashboard-api',
      event: 'started',
      port: PORT,
      ...getDbConfigInfo(process.env),
    }),
  )
})
