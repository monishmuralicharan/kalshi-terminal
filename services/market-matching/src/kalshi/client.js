import { buildHeaders } from './auth.js'

const log = (fields) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'market-matching', ...fields }))

function baseUrl() {
  const u = process.env.KALSHI_BASE_URL
  if (!u) throw new Error('KALSHI_BASE_URL not set')
  return u.replace(/\/$/, '')
}

export async function kalshiRequest(method, path, { body } = {}) {
  const headers = buildHeaders(method, path)
  const url = `${baseUrl()}${path}`
  const start = Date.now()
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const duration_ms = Date.now() - start

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    log({ event: 'kalshi_error', method, path, status: res.status, duration_ms, body: text.slice(0, 300) })
    const err = new Error(`Kalshi ${method} ${path} -> ${res.status}`)
    err.status = res.status
    err.body = text
    throw err
  }

  const json = await res.json()
  log({ event: 'kalshi_ok', method, path, status: res.status, duration_ms })
  return json
}

export const kalshiGet = (path) => kalshiRequest('GET', path)
