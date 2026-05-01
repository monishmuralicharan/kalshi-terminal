function resolveApiBase(opts = {}) {
  if (opts.apiBaseUrl != null) return String(opts.apiBaseUrl).replace(/\/$/, '')
  if (import.meta.env.DEV) return '/api'
  const fromEnv = import.meta.env.VITE_DASHBOARD_API_BASE_URL
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  return ''
}

export function createMarketStreamClient(opts = {}) {
  const apiBaseUrl = resolveApiBase(opts)

  async function fetchMarkets() {
    const res = await fetch(`${apiBaseUrl}/markets`)
    if (!res.ok) throw new Error(`markets request failed: ${res.status}`)
    const body = await res.json()
    return body.markets ?? []
  }

  async function fetchSnapshot(ticker) {
    const res = await fetch(`${apiBaseUrl}/markets/${encodeURIComponent(ticker)}/snapshot`)
    if (!res.ok) throw new Error(`snapshot request failed: ${res.status}`)
    const body = await res.json()
    return body.snapshot
  }

  async function fetchStackStatus() {
    const res = await fetch(`${apiBaseUrl}/stack-status`)
    if (!res.ok) throw new Error(`stack-status failed: ${res.status}`)
    return res.json()
  }

  function connect(onEvent) {
    const source = new EventSource(`${apiBaseUrl}/stream`)
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data))
      } catch {
        // Ignore malformed events from network intermediaries.
      }
    }
    source.addEventListener('market-book-live', (event) => {
      onEvent(JSON.parse(event.data))
    })
    source.addEventListener('market-status-live', (event) => {
      onEvent(JSON.parse(event.data))
    })
    source.addEventListener('market-trades-live', (event) => {
      onEvent(JSON.parse(event.data))
    })
    return () => source.close()
  }

  return { fetchMarkets, fetchSnapshot, fetchStackStatus, connect }
}
