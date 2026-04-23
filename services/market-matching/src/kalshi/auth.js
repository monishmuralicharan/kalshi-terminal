import { createSign, createPrivateKey, constants } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, isAbsolute } from 'path'

let privateKey

// Relative KALSHI_PRIVATE_KEY_PATH values resolve against KALSHI_KEY_BASE_DIR
// if set, else the current working directory. index.js sets KALSHI_KEY_BASE_DIR
// to the project root so services invoked from their own directories still
// find the key.
function loadKey() {
  if (privateKey) return privateKey
  const rawPath = process.env.KALSHI_PRIVATE_KEY_PATH
  if (!rawPath) throw new Error('KALSHI_PRIVATE_KEY_PATH not set')
  const base = process.env.KALSHI_KEY_BASE_DIR ?? process.cwd()
  const path = isAbsolute(rawPath) ? rawPath : resolve(base, rawPath)
  const pem = readFileSync(path, 'utf8')
  privateKey = createPrivateKey(pem)
  return privateKey
}

export function signMessage(message, key = loadKey()) {
  const sign = createSign('SHA256')
  sign.update(message)
  return sign.sign(
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
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
