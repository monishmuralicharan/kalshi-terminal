import React from 'react'

const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'monospace' }

export function OrderbookLadder({ snapshot }) {
  if (!snapshot) return <p>No market selected.</p>
  const bids = snapshot.book_data?.bids ?? snapshot.book?.bids ?? []
  const asks = snapshot.book_data?.asks ?? snapshot.book?.asks ?? []
  const ticker = snapshot.ticker_data ?? snapshot.ticker ?? {}

  return (
    <div>
      <h3>Orderbook: {snapshot.market_ticker}</h3>
      <p>
        Status: {snapshot.status} | Source: {snapshot.source} | Last update: {snapshot.updated_at ?? snapshot.last_provider_ts}
      </p>
      <p>
        Best bid: {ticker.best_bid ?? '-'} | Best ask: {ticker.best_ask ?? '-'} | Last: {ticker.last_price ?? '-'} | Vol: {ticker.volume ?? '-'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h4>Bids</h4>
          {bids.map((level, idx) => (
            <div key={`b-${idx}`} style={row}>
              <span>{Number(level.price).toFixed(4)}</span>
              <span>{level.size}</span>
            </div>
          ))}
        </div>
        <div>
          <h4>Asks</h4>
          {asks.map((level, idx) => (
            <div key={`a-${idx}`} style={row}>
              <span>{Number(level.price).toFixed(4)}</span>
              <span>{level.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
