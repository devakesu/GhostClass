// Crypto utility functions for encryption and decryption
// src/lib/crypto.ts

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { 
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_KEY_PATTERN,
  ENCRYPTION_IV_LENGTH_BYTES,
  ENCRYPTION_AUTH_TAG_LENGTH_BYTES,
  ENCRYPTION_MAX_INPUT_SIZE,
  ENCRYPTION_IV_PATTERN,
} from '@/lib/constants/crypto';

/**
 * Represents the ciphertext produced by encrypt().
 *
 * Always pass this object directly to the decrypt() overload that accepts EncryptedData
 * rather than destructuring and calling decrypt(result.iv, result.content). The object
 * form makes it a compile-time error to swap the two fields.
 */
export type EncryptedData = { readonly iv: string; readonly content: string };

// Cache for validated encryption key
let cachedKey: Buffer | null = null;

/**
 * Reset the cached encryption key.
 * @internal Test helper only — no-op in production to prevent DoS-via-cache-invalidation.
 */
export function __resetCachedKey(): void {
  if (process.env.NODE_ENV === 'production') return;
  cachedKey = null;
}

// Lazy validation: validate and get key only when needed
// Note: This validation duplicates the checks in validateEnvironment() (validate-env.ts).
// This is intentional defense-in-depth to handle edge cases where validateEnvironment()
// might not run (e.g., in unit tests, CLI scripts, or non-standard entry points).
// In production, validateEnvironment() runs at server startup (app/layout.tsx) and will
// catch invalid keys before this function is ever called.
function getEncryptionKey(): Buffer {
  // Return cached key if already validated
  if (cachedKey) {
    return cachedKey;
  }
  
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is not defined");
  }
  if (!ENCRYPTION_KEY_PATTERN.test(ENCRYPTION_KEY)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  
  cachedKey = Buffer.from(ENCRYPTION_KEY, 'hex');
  return cachedKey;
}

export const encrypt = (text: string): EncryptedData => {

  if (!text || typeof text !== 'string') {
    throw new Error("Invalid input: text must be a non-empty string");
  }
  if (text.length > ENCRYPTION_MAX_INPUT_SIZE) {
    throw new Error("Input text too long (max 100KB)");
  }

  const KEY = getEncryptionKey();
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH_BYTES); // NIST SP 800-38D §8.2.1 — 96-bit IV
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    content: `${authTag}:${encrypted}`
  };
};

/**
 * Decrypts an AES-256-GCM ciphertext.
 *
 * **Preferred** – pass the full object returned by encrypt():
 * ```ts
 * const data = encrypt(plaintext);
 * const plain = decrypt(data); // TypeScript enforces correct field order
 * ```
 * The two-argument form is still accepted for backward compatibility but is
 * discouraged because swapping `ivHex` and `content` is a silent runtime error
 * that only manifests as a decryption failure.
 */
export function decrypt(data: EncryptedData): string;
/** @deprecated Prefer `decrypt(encryptedData)` to prevent iv/content swap. */
export function decrypt(ivHex: string, content: string): string;
export function decrypt(ivHexOrData: string | EncryptedData, contentArg?: string): string {
  if (!ivHexOrData) {
    throw new Error("Invalid input: IV and content are required");
  }
  const ivHex = typeof ivHexOrData === 'string' ? ivHexOrData : ivHexOrData.iv;
  const content = typeof ivHexOrData === 'string' ? contentArg! : ivHexOrData.content;

  if (!ivHex || !content) {
    throw new Error("Invalid input: IV and content are required");
  }
  if (!ENCRYPTION_IV_PATTERN.test(ivHex)) {
    throw new Error("Invalid IV format (must be 24 hex chars)");
  }
  if (!content.includes(':')) {
    throw new Error("Invalid content format (missing separator)");
  }

  const parts = content.split(':');
  if (parts.length !== 2) {
    throw new Error("Invalid content format (unexpected separators)");
  }
  const [authTagHex, encryptedText] = parts;
  
  if (!/^[a-f0-9]+$/i.test(authTagHex) || !/^[a-f0-9]+$/i.test(encryptedText)) {
    throw new Error("Invalid content format (non-hex characters)");
  }

  // AES-GCM auth tag must be exactly 16 bytes = 32 hex chars (ENCRYPTION_AUTH_TAG_LENGTH_BYTES * 2).
  // A shorter tag silently weakens authentication without failing until decipher.final().
  if (authTagHex.length !== ENCRYPTION_AUTH_TAG_LENGTH_BYTES * 2) {
    throw new Error("Invalid auth tag length (must be 32 hex chars)");
  }

  const KEY = getEncryptionKey();
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_error) {
    // Log the original error internally for debugging and crypto-health monitoring.
    // The sanitized public message intentionally omits detail to avoid leaking key/IV
    // information to callers.
    logger.error('[crypto] Decryption failed', _error);
    Sentry.captureException(_error, { level: 'error', tags: { type: 'decryption_failure', location: 'crypto/decrypt' } });
    throw new Error('Decryption failed');
  }
}