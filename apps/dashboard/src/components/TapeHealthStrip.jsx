import React from 'react'

function fmtAge(iso) {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec / 60)
  return `${m}m ago`
}

function Stat({ label, value, valueClass = '', wide = false }) {
  return (
    <div className={`tape-stat${wide ? ' wide' : ''}`}>
      <span className="label">{label}</span>
      <span className={`value ${valueClass}`.trim()}>{value}</span>
    </div>
  )
}

export function TapeHealthStrip({ stackStatus, lastSseAt, snapshot }) {
  const md = stackStatus?.market_data
  const src = snapshot?.source ?? md?.fallback_mode ?? '—'
  const updated = snapshot?.updated_at ?? snapshot?.last_provider_ts

  return (
    <section className="tape-strip" aria-label="Tape and stack health">
      <Stat
        label="Stack API"
        value={stackStatus ? 'reachable' : '…'}
        valueClass={stackStatus ? 'ok' : ''}
      />
      <Stat label="Postgres" value={stackStatus?.pg_ok ? 'ok' : 'down'} valueClass={stackStatus?.pg_ok ? 'ok' : 'bad'} />
      <Stat label="Redis" value={stackStatus?.redis_ok ? 'ok' : 'down'} valueClass={stackStatus?.redis_ok ? 'ok' : 'bad'} />
      <Stat label="SSE clients" value={String(stackStatus?.sse_clients ?? '—')} />
      <Stat
        label="market-data"
        value={md ? `${md.ws_state ?? '—'} · ${md.fallback_mode ?? '—'}` : 'no heartbeat'}
        valueClass={md ? 'ok' : ''}
      />
      <Stat label="Last WS msg" value={fmtAge(md?.last_ws_message_at)} />
      <Stat label="Last SSE (browser)" value={fmtAge(lastSseAt)} />
      <Stat label="Book source" value={String(src)} />
      <Stat label="Book updated" value={fmtAge(updated)} />
      <Stat label="Events / min" value={String(stackStatus?.recent_event_count ?? '—')} />
      {md?.last_error ? (
        <Stat label="Ingest error" value={md.last_error} valueClass="bad" wide />
      ) : null}
    </section>
  )
}
