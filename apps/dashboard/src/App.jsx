import React, { useEffect, useMemo, useState } from 'react'
import { OrderbookLadder } from './components/OrderbookLadder.jsx'
import { TapeHealthStrip } from './components/TapeHealthStrip.jsx'
import { createMarketStreamClient } from './lib/marketStreamClient.js'

function connectionBadgeClass(connection) {
  if (connection === 'ws_live') return 'connection-badge live'
  if (connection === 'poll_fallback') return 'connection-badge fallback'
  if (connection === 'error') return 'connection-badge error'
  return 'connection-badge connecting'
}

function connectionLabel(connection) {
  if (connection === 'ws_live') return 'Live'
  if (connection === 'poll_fallback') return 'REST snapshot'
  if (connection === 'error') return 'Disconnected'
  return 'Connecting'
}

export function App() {
  const client = useMemo(() => createMarketStreamClient({}), [])
  const [connection, setConnection] = useState('connecting')
  const [markets, setMarkets] = useState([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [stackStatus, setStackStatus] = useState(null)
  const [lastSseAt, setLastSseAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      client
        .fetchStackStatus()
        .then((s) => {
          if (!cancelled) setStackStatus(s)
        })
        .catch(() => {
          if (!cancelled) setStackStatus(null)
        })
    }
    poll()
    const id = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [client])

  useEffect(() => {
    let mounted = true
    client
      .fetchMarkets()
      .then((result) => {
        if (!mounted) return
        setMarkets(result)
        if (!selected && result[0]) setSelected(result[0])
      })
      .catch(() => setConnection('error'))

    const disconnect = client.connect((event) => {
      setConnection('ws_live')
      setLastSseAt(new Date().toISOString())
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
    client
      .fetchSnapshot(selected)
      .then((s) => setSnapshot(s))
      .catch(() => setConnection('poll_fallback'))
  }, [client, selected])

  const consoleHref = import.meta.env.DEV
    ? `${import.meta.env.VITE_DASHBOARD_CONSOLE_ORIGIN ?? 'http://127.0.0.1:4010'}/console`
    : '/console'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title-block">
          <h1>Kalshi Terminal</h1>
          <p>Live orderbook and tape health for tracked markets.</p>
        </div>
        <div className={connectionBadgeClass(connection)} title="Feed state">
          <span className="dot" aria-hidden />
          {connectionLabel(connection)}
        </div>
      </header>

      <TapeHealthStrip stackStatus={stackStatus} lastSseAt={lastSseAt} snapshot={snapshot} />

      <div className="controls-row">
        <div>
          <label className="control-label" htmlFor="market-select">
            Market
          </label>
          <select
            id="market-select"
            className="market-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!markets.length}
          >
            {!markets.length ? <option value="">No markets yet</option> : null}
            {markets.map((ticker) => (
              <option key={ticker} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>
        </div>
        <p className="link-console">
          <a href={consoleHref} target="_blank" rel="noreferrer">
            Open stack console
          </a>
          {' · '}
          <span>REST + SSE status</span>
        </p>
      </div>

      <OrderbookLadder snapshot={snapshot} />
    </div>
  )
}
