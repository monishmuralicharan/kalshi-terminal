import { createHash } from 'crypto'

const TTL_SECONDS = 172_800

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

export function createDedup(redis) {
  return {
    async check(url) {
      const key = `dedup:${hash(url)}`
      const result = await redis.set(key, '1', 'EX', TTL_SECONDS, 'NX')
      return result === 'OK'
    },
  }
}
