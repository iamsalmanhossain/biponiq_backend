import crypto from 'crypto'
import type { EpsDecryptedIpnPayload, EpsEncryptedIpnPayload, EpsIpnRequest } from './eps.types.js'

export const createEpsHash = (value: string, hashKey: string): string => {
  return crypto
    .createHmac('sha512', Buffer.from(hashKey, 'utf8'))
    .update(value, 'utf8')
    .digest('base64')
}

const isPlausibleBase64 = (value: string): boolean => {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.replace(/=/g, '').length % 4 !== 1
}

export const parseEpsEncryptedIpnPayload = (payload: unknown): EpsEncryptedIpnPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  const data = (payload as EpsIpnRequest).Data

  if (typeof data !== 'string' || !data) {
    return null
  }

  const parts = data.split(':')

  if (parts.length !== 2) {
    return null
  }

  const [iv, ciphertext] = parts

  if (!iv || !ciphertext || !isPlausibleBase64(iv) || !isPlausibleBase64(ciphertext)) {
    return null
  }

  return { iv, ciphertext }
}

export const decryptEpsIpnPayload = (
  payload: EpsEncryptedIpnPayload,
  secretKey: string
): EpsDecryptedIpnPayload => {
  let key = Buffer.from(secretKey, 'utf8')

  if (key.length > 32) {
    key = key.subarray(0, 32)
  } else if (key.length < 32) {
    key = Buffer.concat([key, Buffer.alloc(32 - key.length)])
  }

  const iv = Buffer.from(payload.iv, 'base64')
  const ciphertext = Buffer.from(payload.ciphertext, 'base64')

  if (iv.length !== 16) {
    throw new Error('Invalid EPS IPN IV length')
  }

  if (!ciphertext.length || ciphertext.length % 16 !== 0) {
    throw new Error('Invalid EPS IPN ciphertext length')
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

  decipher.setAutoPadding(true)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')

  let parsed: unknown

  try {
    parsed = JSON.parse(decrypted)
  } catch {
    throw new Error('Invalid EPS IPN decrypted payload')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid EPS IPN decrypted payload')
  }

  return parsed as EpsDecryptedIpnPayload
}
