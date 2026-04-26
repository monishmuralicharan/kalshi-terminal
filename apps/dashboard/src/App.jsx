import React, { useEffect, useMemo, useState } from 'react'
import { OrderbookLadder } from './components/OrderbookLadder.jsx'
import { createMarketStreamClient } from './lib/marketStreamClient.js'

export function App() {
  const client = useMemo(() => createMarketStreamClient({}), [])
  const [connection, setConnection] = useState('connecting')
  const [markets, setMarkets] = useState([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    let mounted = true
    client.fetchMarkets()
      .then((result) => {
        if (!mounted) return
        setMarkets(result)
        if (!selected && result[0]) setSelected(result[0])
      })
      .catch(() => setConnection('error'))

    const disconnect = client.connect((event) => {
      setConnection('ws_live')
      if (event?.meta?.market_ticker === selected || event?.market_ticker === selected) {
        if (event.payload?.book) {
          setSnapshot((prev) => ({
            ...(prev ?? {}),
            market_ticker: selected,
            book: event.payload.book,
            ticker: {
              ...(prev?.ticker ?? {}),
              best_bid: event.payload.best_bid ?? prev?.ticker?.best_bid,
              best_ask: event.payload.best_ask ?? prev?.ticker?.best_ask,
              last_price: event.payload.last_price ?? prev?.ticker?.last_price,
              volume: event.payload.volume ?? prev?.ticker?.volume,
            },
            status: event.payload.status ?? prev?.status,
            updated_at: event.meta?.provider_ts ?? new Date().toISOString(),
            source: event.meta?.source ?? 'ws',
          }))
        }
      }
    })

    return () => {
      mounted = false
      disconnect()
    }
  }, [client, selected])

  useEffect(() => {
    if (!selected) return
    client.fetchSnapshot(selected)
      .then((s) => setSnapshot(s))
      .catch(() => setConnection('poll_fallback'))
  }, [client, selected])

  return (
    <div style={{ margin: '2rem auto', maxWidth: 1000, fontFamily: 'sans-serif' }}>
      <h1>Kalshi Live Orderbook</h1>
      <p>Connection state: {connection}</p>
      <label htmlFor="market-select">Market:</label>
      <select
        id="market-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ marginLeft: 8 }}
      >
        {markets.map((ticker) => (
          <option key={ticker} value={ticker}>{ticker}</option>
        ))}
      </select>
      <OrderbookLadder snapshot={snapshot} />
    </div>
  )
}
