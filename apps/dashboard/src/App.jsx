import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnomaliesPanel } from './components/AnomaliesPanel.jsx'
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

function since24hIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

export function App() {
  const client = useMemo(() => createMarketStreamClient({}), [])
  const [connection, setConnection] = useState('connecting')
  const [markets, setMarkets] = useState([])
  const [extraMarkets, setExtraMarkets] = useState([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [stackStatus, setStackStatus] = useState(null)
  const [lastSseAt, setLastSseAt] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [anomaliesLoading, setAnomaliesLoading] = useState(false)
  const [anomaliesError, setAnomaliesError] = useState(null)
  const [anomaliesRefreshedAt, setAnomaliesRefreshedAt] = useState(null)
  const [signalFilter, setSignalFilter] = useState('')
  const [anomalyScope, setAnomalyScope] = useState('all')

  const marketOptions = useMemo(() => {
    const seen = new Set()
    const merged = []
    for (const t of [...markets, ...extraMarkets]) {
      if (t && !seen.has(t)) {
        seen.add(t)
        merged.push(t)
      }
    }
    return merged.sort()
  }, [markets, extraMarkets])

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
    let cancelled = false

    const loadAnomalies = async () => {
      setAnomaliesLoading(true)
      setAnomaliesError(null)
      try {
        let rows
        if (anomalyScope === 'selected' && selected) {
          rows = await client.fetchAnomaliesForMarket(selected, { limit: 50 })
          if (signalFilter) {
            rows = rows.filter((r) => r.signal_type === signalFilter)
          }
        } else {
          rows = await client.fetchAnomalies({
            since: since24hIso(),
            signalType: signalFilter || undefined,
            limit: 50,
          })
        }
        if (!cancelled) {
          setAnomalies(rows)
          setAnomaliesRefreshedAt(new Date().toISOString())
        }
      } catch (err) {
        if (!cancelled) {
          setAnomaliesError(err.message)
          setAnomalies([])
        }
      } finally {
        if (!cancelled) setAnomaliesLoading(false)
      }
    }

    loadAnomalies()
    const id = setInterval(loadAnomalies, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [client, anomalyScope, selected, signalFilter])

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

  const handleSelectMarket = useCallback(
    (marketId) => {
      setSelected(marketId)
      if (marketId && !markets.includes(marketId) && !extraMarkets.includes(marketId)) {
        setExtraMarkets((prev) => [...prev, marketId])
      }
    },
    [markets, extraMarkets],
  )

  const consoleHref = import.meta.env.DEV
    ? `${import.meta.env.VITE_DASHBOARD_CONSOLE_ORIGIN ?? 'http://127.0.0.1:4010'}/console`
    : '/console'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title-block">
          <h1>Kalshi Terminal</h1>
          <p>Live orderbook, tape health, and anomaly alerts.</p>
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
            disabled={!marketOptions.length}
          >
            {!marketOptions.length ? <option value="">No markets yet</option> : null}
            {marketOptions.map((ticker) => (
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

      <AnomaliesPanel
        anomalies={anomalies}
        loading={anomaliesLoading}
        error={anomaliesError}
        selectedMarket={selected}
        signalFilter={signalFilter}
        onSignalFilterChange={setSignalFilter}
        scopeFilter={anomalyScope}
        onScopeFilterChange={setAnomalyScope}
        onSelectMarket={handleSelectMarket}
        lastRefreshedAt={anomaliesRefreshedAt}
      />
    </div>
  )
}
