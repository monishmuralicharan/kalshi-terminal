const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createKalshiWsClient({
  wsUrl,
  subscriptionManager,
  onMessage,
  onStateChange,
  websocketCtor = globalThis.WebSocket,
  maxBackoffMs = 20_000,
}) {
  if (!websocketCtor) throw new Error('WebSocket implementation is required')

  let running = false
  let socket
  let reconnectAttempt = 0

  async function connectLoop() {
    while (running) {
      try {
        onStateChange?.('connecting')
        await connectOnce()
        reconnectAttempt = 0
      } catch {
        onStateChange?.('reconnecting')
        const delay = Math.min(1_000 * (2 ** reconnectAttempt), maxBackoffMs)
        reconnectAttempt += 1
        await sleep(delay + Math.floor(Math.random() * 250))
      }
    }
    onStateChange?.('stopped')
  }

  function connectOnce() {
    return new Promise((resolve, reject) => {
      socket = new websocketCtor(wsUrl)
      let opened = false

      socket.onopen = () => {
        opened = true
        onStateChange?.('live')
        socket.send(JSON.stringify(subscriptionManager.buildSubscribeMessage()))
      }
      socket.onmessage = (message) => onMessage?.(message.data)
      socket.onerror = (error) => {
        if (!opened) reject(error)
      }
      socket.onclose = () => {
        if (!running) return resolve()
        reject(new Error('socket closed'))
      }
    })
  }

  return {
    async start() {
      if (running) return
      running = true
      await connectLoop()
    },
    stop() {
      running = false
      if (socket && socket.readyState === 1) socket.close()
    },
  }
}
