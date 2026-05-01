import React, { useMemo } from 'react'

function sortLevels(levels, side) {
  const arr = [...(levels ?? [])]
  arr.sort((a, b) =>
    side === 'bid' ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price),
  )
  return arr
}

function fmtPrice(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—'
  return Number(n).toFixed(2)
}

function DepthSide({ title, side, levels, maxSize }) {
  let cum = 0
  return (
    <div className={`orderbook-side ${side === 'ask' ? 'asks' : ''}`}>
      <h3 className={`side-title ${side === 'bid' ? 'bids' : 'asks'}`}>{title}</h3>
      <div className="depth-header">
        <span>Depth</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span style={{ textAlign: 'right' }}>Cum</span>
      </div>
      {levels.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '8px 4px' }}>No levels</p>
      ) : (
        levels.map((level, idx) => {
          const size = Number(level.size) || 0
          cum += size
          const pct = maxSize > 0 ? Math.min(100, (size / maxSize) * 100) : 0
          return (
            <div key={`${side}-${idx}`} className={`depth-row ${side === 'bid' ? 'bid' : 'ask'}`}>
              <span className="bar" style={{ width: `${pct}%` }} />
              <span className="cell price">{fmtPrice(level.price)}</span>
              <span className="cell size">{size}</span>
              <span className="cell cum">{cum}</span>
            </div>
          )
        })
      )}
    </div>
  )
}

export function OrderbookLadder({ snapshot }) {
  const bidsRaw = snapshot?.book_data?.bids ?? snapshot?.book?.bids ?? []
  const asksRaw = snapshot?.book_data?.asks ?? snapshot?.book?.asks ?? []

  const { bids, asks, maxSize, spread, mid, ticker } = useMemo(() => {
    const tickerData = snapshot?.ticker_data ?? snapshot?.ticker ?? {}
    const bidsSorted = sortLevels(bidsRaw, 'bid')
    const asksSorted = sortLevels(asksRaw, 'ask')
    const sizes = [...bidsSorted, ...asksSorted].map((l) => Number(l.size) || 0)
    const max = Math.max(1, ...sizes)
    const bb = Number(tickerData.best_bid)
    const ba = Number(tickerData.best_ask)
    const spr =
      Number.isFinite(bb) && Number.isFinite(ba) && ba >= bb ? (ba - bb).toFixed(2) : null
    const midVal =
      Number.isFinite(bb) && Number.isFinite(ba) && ba >= bb ? ((bb + ba) / 2).toFixed(2) : null
    return {
      bids: bidsSorted,
      asks: asksSorted,
      maxSize: max,
      spread: spr,
      mid: midVal,
      ticker: tickerData,
    }
  }, [snapshot, bidsRaw, asksRaw])

  if (!snapshot) {
    return (
      <div className="orderbook-card">
        <div className="empty-state">
          <h3>Select a market</h3>
          <p>Choose a ticker above. Data appears after market-data has written snapshots for your configured list.</p>
        </div>
      </div>
    )
  }

  return (
    <article className="orderbook-card">
      <header className="orderbook-card-header">
        <h2>{snapshot.market_ticker}</h2>
        <div className="orderbook-meta">
          <span>
            Status <strong>{snapshot.status ?? '—'}</strong>
          </span>
          <span>
            Source <strong>{snapshot.source ?? '—'}</strong>
          </span>
          <span>
            Updated <strong>{snapshot.updated_at ?? snapshot.last_provider_ts ?? '—'}</strong>
          </span>
        </div>
      </header>

      <div className="metrics-row">
        <div className="metric">
          <div className="m-label">Best bid</div>
          <div className="m-value" style={{ color: 'var(--bid)' }}>
            {fmtPrice(ticker.best_bid)}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Best ask</div>
          <div className="m-value" style={{ color: 'var(--ask)' }}>
            {fmtPrice(ticker.best_ask)}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Spread</div>
          <div className="m-value">{spread ?? '—'}</div>
          <div className="m-sub">Mid {mid ?? '—'}</div>
        </div>
        <div className="metric">
          <div className="m-label">Last</div>
          <div className="m-value">{fmtPrice(ticker.last_price)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Volume</div>
          <div className="m-value">{ticker.volume ?? '—'}</div>
        </div>
      </div>

      <div className="orderbook-columns">
        <DepthSide title="Bids" side="bid" levels={bids} maxSize={maxSize} />
        <DepthSide title="Asks" side="ask" levels={asks} maxSize={maxSize} />
      </div>
    </article>
  )
}
