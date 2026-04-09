// Encrypt/decrypt API keys using AES-256-GCM
// Keys are NEVER returned decrypted to the frontend

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET is not set')
  // Derive a 32-byte key from the secret
  return createHash('sha256').update(secret).digest()
}

export function encryptKey(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(12) + tag(16) + ciphertext — all hex encoded
  return Buffer.concat([iv, tag, encrypted]).toString('hex')
}

export function decryptKey(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'hex')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
