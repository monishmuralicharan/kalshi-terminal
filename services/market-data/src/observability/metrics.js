export function createMetrics() {
  const counters = new Map()
  const gauges = new Map()

  function inc(name, value = 1) {
    counters.set(name, (counters.get(name) ?? 0) + value)
  }

  function setGauge(name, value) {
    gauges.set(name, value)
  }

  function snapshot() {
    return {
      counters: Object.fromEntries(counters.entries()),
      gauges: Object.fromEntries(gauges.entries()),
      ts: new Date().toISOString(),
    }
  }

  return { inc, setGauge, snapshot }
}
