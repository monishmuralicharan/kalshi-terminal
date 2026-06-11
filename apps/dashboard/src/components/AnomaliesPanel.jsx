import React from 'react'

const SIGNAL_LABELS = {
  volume_spike: 'Volume spike',
  price_no_news: 'Price, no news',
  trade_cluster: 'Trade cluster',
  rapid_resolution: 'Rapid resolution',
  pin_elevated: 'PIN elevated',
}

function fmtAge(iso) {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function scoreClass(score) {
  if (score >= 0.85) return 'danger'
  if (score >= 0.7) return 'warn'
  return ''
}

function parseDetails(details) {
  if (details == null) return {}
  if (typeof details === 'object') return details
  try {
    return JSON.parse(details)
  } catch {
    return {}
  }
}

function detailSnippet(signalType, details) {
  const d = details ?? {}
  switch (signalType) {
    case 'volume_spike':
      return d.multiplier != null ? `${d.multiplier}x volume` : '—'
    case 'price_no_news':
      return d.price_delta != null ? `Δ${Number(d.price_delta).toFixed(2)} no news` : '—'
    case 'trade_cluster':
      return d.trade_count != null && d.multiplier != null
        ? `${d.trade_count} trades (${d.multiplier}x)`
        : '—'
    case 'rapid_resolution':
      return d.hours_to_close != null && d.price_delta != null
        ? `${d.hours_to_close}h to close, Δ${Number(d.price_delta).toFixed(2)}`
        : '—'
    case 'pin_elevated':
      return d.pin != null ? `PIN ${Number(d.pin).toFixed(3)}` : '—'
    default:
      return '—'
  }
}

export function AnomaliesPanel({
  anomalies,
  loading,
  error,
  selectedMarket,
  signalFilter,
  onSignalFilterChange,
  scopeFilter,
  onScopeFilterChange,
  onSelectMarket,
  lastRefreshedAt,
}) {
  return (
    <section className="anomalies-card" aria-label="Anomaly alerts">
      <div className="anomalies-card-header">
        <div>
          <h2>Anomaly alerts</h2>
          <p className="anomalies-meta">
            Insider-detection signals · refreshed {fmtAge(lastRefreshedAt)}
            {loading ? ' · updating…' : ''}
          </p>
        </div>
        <div className="anomalies-filters">
          <div>
            <label className="control-label" htmlFor="anomaly-scope">
              Scope
            </label>
            <select
              id="anomaly-scope"
              className="market-select anomalies-select"
              value={scopeFilter}
              onChange={(e) => onScopeFilterChange(e.target.value)}
            >
              <option value="all">All markets</option>
              <option value="selected">Selected market only</option>
            </select>
          </div>
          <div>
            <label className="control-label" htmlFor="anomaly-signal">
              Signal
            </label>
            <select
              id="anomaly-signal"
              className="market-select anomalies-select"
              value={signalFilter}
              onChange={(e) => onSignalFilterChange(e.target.value)}
            >
              <option value="">All signals</option>
              <option value="volume_spike">Volume spike</option>
              <option value="price_no_news">Price, no news</option>
              <option value="trade_cluster">Trade cluster</option>
              <option value="rapid_resolution">Rapid resolution</option>
              <option value="pin_elevated">PIN elevated</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="anomalies-empty">
          <p className="anomalies-error">Failed to load anomalies: {error}</p>
        </div>
      ) : anomalies.length === 0 && !loading ? (
        <div className="anomalies-empty">
          <h3>No anomalies in the last 24h</h3>
          <p>Scoring runs every 5 minutes. Alerts appear when trade patterns exceed baselines.</p>
        </div>
      ) : (
        <div className="anomalies-table-wrap">
          <table className="anomalies-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Signal</th>
                <th>Score</th>
                <th>Category</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((row) => {
                const details = parseDetails(row.details)
                const isSelected = row.market_id === selectedMarket
                const sc = Number(row.score) || 0
                return (
                  <tr
                    key={row.id}
                    className={`anomaly-row${isSelected ? ' selected' : ''}`}
                    onClick={() => onSelectMarket(row.market_id)}
                    title="Click to select market"
                  >
                    <td className="cell-time">{fmtAge(row.detected_at)}</td>
                    <td className="cell-market">{row.market_id}</td>
                    <td>
                      <span className={`signal-badge signal-${row.signal_type}`}>
                        {SIGNAL_LABELS[row.signal_type] ?? row.signal_type}
                      </span>
                    </td>
                    <td className="cell-score">
                      <div className="score-cell">
                        <div className="score-bar-track">
                          <div
                            className={`score-bar-fill ${scoreClass(sc)}`}
                            style={{ width: `${Math.min(100, sc * 100)}%` }}
                          />
                        </div>
                        <span className={`score-value ${scoreClass(sc)}`}>{sc.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="cell-category">{details?.category ?? '—'}</td>
                    <td className="cell-detail">{detailSnippet(row.signal_type, details)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
