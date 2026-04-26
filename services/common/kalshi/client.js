import { buildHeaders } from './auth.js'

function baseUrl() {
  const url = process.env.KALSHI_BASE_URL
  if (!url) throw new Error('KALSHI_BASE_URL not set')
  return url.replace(/\/$/, '')
}

export async function kalshiRequest(method, path, { body } = {}) {
  const headers = buildHeaders(method, path)
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(`Kalshi ${method} ${path} -> ${response.status}`)
    error.status = response.status
    error.body = text
    throw error
  }
  return response.json()
}

export const kalshiGet = (path) => kalshiRequest('GET', path)
