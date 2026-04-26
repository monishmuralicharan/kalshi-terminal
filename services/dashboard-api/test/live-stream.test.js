import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createLiveStream } from '../src/stream/live-stream.js'

test('live stream subscribes and forwards messages to clients', async () => {
  const redisSub = new EventEmitter()
  redisSub.subscribe = async (...channels) => channels

  let writes = []
  const client = {
    write(chunk) {
      writes.push(chunk)
    },
  }
  const clients = new Set([client])
  const stream = createLiveStream({ redisSub, clients })
  await stream.start()

  redisSub.emit('message', 'market-book-live', '{"type":"book_snapshot"}')
  assert.equal(writes.length > 0, true)
  assert.equal(writes.join('').includes('market-book-live'), true)
})
