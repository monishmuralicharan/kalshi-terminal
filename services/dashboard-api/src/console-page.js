export function getConsolePageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kalshi Terminal — Stack console</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem 1.5rem; background: #0f1419; color: #e6edf3; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    pre { background: #161b22; padding: 1rem; border-radius: 8px; overflow: auto; font-size: 12px; line-height: 1.4; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    a { color: #58a6ff; }
    .muted { color: #8b949e; font-size: 13px; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>Kalshi Terminal — stack console</h1>
  <p class="muted">Auto-refresh every 5s. Same-origin API; use <code>/stream</code> for SSE (e.g. <code>curl -N http://localhost:4010/stream</code>).</p>
  <div class="grid">
    <div>
      <div class="muted">GET /health/live</div>
      <pre id="live">…</pre>
    </div>
    <div>
      <div class="muted">GET /health/ready</div>
      <pre id="ready">…</pre>
    </div>
    <div>
      <div class="muted">GET /stack-status</div>
      <pre id="stack">…</pre>
    </div>
    <div>
      <div class="muted">GET /config</div>
      <pre id="cfg">…</pre>
    </div>
  </div>
  <p><a href="/">Open dashboard UI</a> (requires <code>apps/dashboard</code> build — see README)</p>
  <script>
    async function load() {
      try {
        const [live, ready, stack, cfg] = await Promise.all([
          fetch('/health/live').then((r) => r.json()),
          fetch('/health/ready').then((r) => r.json()),
          fetch('/stack-status').then((r) => r.json()),
          fetch('/config').then((r) => r.json()),
        ])
        document.getElementById('live').textContent = JSON.stringify(live, null, 2)
        document.getElementById('ready').textContent = JSON.stringify(ready, null, 2)
        document.getElementById('stack').textContent = JSON.stringify(stack, null, 2)
        document.getElementById('cfg').textContent = JSON.stringify(cfg, null, 2)
      } catch (e) {
        document.getElementById('stack').textContent = String(e)
      }
    }
    load()
    setInterval(load, 5000)
  </script>
</body>
</html>`
}
