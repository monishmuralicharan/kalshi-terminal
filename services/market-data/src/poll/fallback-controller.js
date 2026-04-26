export function createFallbackController({
  staleAfterMs = 15_000,
  onFallback,
  onRecover,
} = {}) {
  let mode = 'ws'
  let lastWsUpdateAt = Date.now()

  function markWsUpdate() {
    lastWsUpdateAt = Date.now()
    if (mode !== 'ws') {
      mode = 'ws'
      onRecover?.()
    }
  }

  function checkStaleness() {
    if (Date.now() - lastWsUpdateAt > staleAfterMs && mode !== 'poll') {
      mode = 'poll'
      onFallback?.()
    }
    return mode
  }

  return {
    markWsUpdate,
    checkStaleness,
    mode: () => mode,
  }
}
