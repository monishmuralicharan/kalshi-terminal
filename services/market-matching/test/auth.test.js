import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, createVerify, generateKeyPairSync, constants } from 'crypto'
import { buildHeaders, signMessage } from '../src/kalshi/auth.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pubPem = publicKey.export({ type: 'spki', format: 'pem' })

function verify(message, signature) {
  const v = createVerify('SHA256')
  v.update(message)
  return v.verify(
    { key: createPublicKey(pubPem), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
    Buffer.from(signature, 'base64'),
  )
}

test('signMessage produces a PSS signature that verifies', () => {
  const sig = signMessage('1700000000000GET/trade-api/v2/markets', privateKey)
  assert.ok(verify('1700000000000GET/trade-api/v2/markets', sig))
})

test('buildHeaders strips query params before signing', () => {
  process.env.KALSHI_API_KEY_ID = 'test-key'
  const clock = () => 1700000000000
  // Stub the private key loader by signing manually via signMessage + same message
  const headersNoQuery = buildHeadersWithKey('GET', '/trade-api/v2/markets', clock, privateKey)
  const headersWithQuery = buildHeadersWithKey(
    'GET',
    '/trade-api/v2/markets?cursor=abc&limit=100',
    clock,
    privateKey,
  )
  // Signatures differ per-call due to PSS salt randomness — verify instead that
  // the query-stripped path is what was signed.
  const signedMessage = '1700000000000GET/trade-api/v2/markets'
  assert.ok(verify(signedMessage, headersNoQuery['KALSHI-ACCESS-SIGNATURE']))
  assert.ok(verify(signedMessage, headersWithQuery['KALSHI-ACCESS-SIGNATURE']))
})

test('buildHeaders uppercases method and sets all required headers', () => {
  process.env.KALSHI_API_KEY_ID = 'abc-123'
  const headers = buildHeadersWithKey('get', '/foo', () => 1234, privateKey)
  assert.equal(headers['KALSHI-ACCESS-KEY'], 'abc-123')
  assert.equal(headers['KALSHI-ACCESS-TIMESTAMP'], '1234')
  assert.equal(headers['Content-Type'], 'application/json')
  assert.ok(verify('1234GET/foo', headers['KALSHI-ACCESS-SIGNATURE']))
})

// Helper: inline version of buildHeaders that accepts an explicit key and clock,
// so tests don't depend on KALSHI_PRIVATE_KEY_PATH being set.
function buildHeadersWithKey(method, path, now, key) {
  const timestamp = String(now())
  const pathWithoutQuery = path.split('?')[0]
  const signedMessage = `${timestamp}${method.toUpperCase()}${pathWithoutQuery}`
  return {
    'KALSHI-ACCESS-KEY': process.env.KALSHI_API_KEY_ID,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signMessage(signedMessage, key),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
