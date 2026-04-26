import { createPrivateKey, createSign, constants } from 'crypto'
import { readFileSync } from 'fs'
import { isAbsolute, resolve } from 'path'

let privateKey

function loadKey() {
  if (privateKey) return privateKey
  const rawPath = process.env.KALSHI_PRIVATE_KEY_PATH
  if (!rawPath) throw new Error('KALSHI_PRIVATE_KEY_PATH not set')
  const base = process.env.KALSHI_KEY_BASE_DIR ?? process.cwd()
  const fullPath = isAbsolute(rawPath) ? rawPath : resolve(base, rawPath)
  privateKey = createPrivateKey(readFileSync(fullPath, 'utf8'))
  return privateKey
}

export function signMessage(message, key = loadKey()) {
  const signer = createSign('SHA256')
  signer.update(message)
  return signer.sign(
    { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
    'base64',
  )
}

export function buildHeaders(method, path, now = Date.now) {
  const keyId = process.env.KALSHI_API_KEY_ID
  if (!keyId) throw new Error('KALSHI_API_KEY_ID not set')
  const timestamp = String(now())
  const pathWithoutQuery = path.split('?')[0]
  const message = `${timestamp}${method.toUpperCase()}${pathWithoutQuery}`
  const signature = signMessage(message)
  return {
    'KALSHI-ACCESS-KEY': keyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signature,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}
