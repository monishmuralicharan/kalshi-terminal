export function createMarketStreamClient({
  apiBaseUrl = import.meta.env.VITE_DASHBOARD_API_BASE_URL ?? 'http://localhost:4010',
}) {
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

  return { fetchMarkets, fetchSnapshot, connect }
}
