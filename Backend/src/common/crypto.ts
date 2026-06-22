/**
 * AES-256-GCM helpers for encrypting/decrypting secrets stored in the DB.
 * Secret: CLAUDE_API_ENCRYPTION_SECRET env var (32-byte hex string = 64 hex chars).
 */
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;

function getKey(): Buffer {
  const secret = process.env.CLAUDE_API_ENCRYPTION_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error(
      'CLAUDE_API_ENCRYPTION_SECRET must be a 64-char hex string (32 bytes). Run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(secret.slice(0, 64), 'hex');
}

/**
 * Encrypts plaintext → base64 string of (iv || tag || ciphertext).
 * Returns "" when given "" so empty keys round-trip cleanly.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a value produced by encrypt(). Returns "" for empty input.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
