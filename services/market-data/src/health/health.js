export function createHealth({ fallbackController, wsStateRef }) {
  return {
    live() {
      return {
        ok: true,
        ts: new Date().toISOString(),
      }
    },
    ready() {
      const mode = fallbackController.mode()
      const wsState = wsStateRef.current
      return {
        ok: mode === 'ws' ? wsState === 'live' : mode === 'poll',
        mode,
        ws_state: wsState,
        ts: new Date().toISOString(),
      }
    },
  }
}
