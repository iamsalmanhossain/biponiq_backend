import crypto from 'node:crypto'
import { env } from '../../config/env.js'

const SECRET_KEY = crypto
  .createHash('sha256')
  .update(env.JWT_ACCESS_SECRET || 'courier_credentials_secret_key_2026')
  .digest()

const SENSITIVE_FIELDS = [
  'password',
  'secretKey',
  'apiKey',
  'clientSecret',
  'apiToken',
  'accessToken',
]

/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export function encryptField(text: string): string {
  if (!text || typeof text !== 'string') return text
  if (text.startsWith('enc:')) return text // Already encrypted

  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`
  } catch (error) {
    console.error('Encryption failed:', error)
    return text
  }
}

/**
 * Decrypt an encrypted field string using AES-256-GCM
 */
export function decryptField(text: string): string {
  if (!text || typeof text !== 'string' || !text.startsWith('enc:')) {
    return text // Return unencrypted / fallback
  }

  try {
    const parts = text.split(':')
    if (parts.length !== 4) return text

    const ivHex = parts[1]
    const authTagHex = parts[2]
    const encryptedHex = parts[3]
    if (!ivHex || !authTagHex || !encryptedHex) return text

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('Decryption failed:', error)
    return text
  }
}


/**
 * Encrypt sensitive keys in a credentials JSON object before saving to database
 */
export function encryptCredentials(
  credentials: Record<string, any>
): Record<string, any> {
  if (!credentials || typeof credentials !== 'object') return credentials

  const result: Record<string, any> = { ...credentials }

  for (const [key, value] of Object.entries(result)) {
    if (SENSITIVE_FIELDS.includes(key) && typeof value === 'string') {
      result[key] = encryptField(value)
    }
  }

  return result
}

/**
 * Decrypt sensitive keys in a credentials JSON object after retrieving from database
 */
export function decryptCredentials(
  credentials: Record<string, any>
): Record<string, any> {
  if (!credentials || typeof credentials !== 'object') return credentials

  const result: Record<string, any> = { ...credentials }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.startsWith('enc:')) {
      result[key] = decryptField(value)
    }
  }

  return result
}
