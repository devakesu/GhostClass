/**
 * Cryptographic constants and validation patterns
 *
 * Centralized definitions to prevent drift between encryption implementation
 * and environment validation. All crypto-related constants are defined here.
 */

/**
 * Encryption key format: 64 hexadecimal characters (32 bytes for AES-256)
 *
 * Used by:
 * - src/lib/crypto.ts - validates key before encryption
 * - src/lib/validate-env.ts - validates key at startup
 * - DB constraints - validates IV format consistency
 */
export const ENCRYPTION_KEY_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * Encryption IV format: 24 hexadecimal characters (12 bytes for AES-GCM)
 *
 * NIST SP 800-38D §8.2.1 recommends 96-bit IV for AES-GCM
 *
 * Used by:
 * - src/lib/crypto.ts - validates IV format
 * - Database check constraints - prevents invalid IVs at DB level
 * - Supabase migrations - enforce IV format validation
 */
export const ENCRYPTION_IV_PATTERN = /^[a-f0-9]{24}$/i;

/**
 * AES-256-GCM algorithm identifier
 */
export const ENCRYPTION_ALGORITHM = "aes-256-gcm";

/**
 * Recommended IV length in bytes (96 bits) for AES-GCM
 */
export const ENCRYPTION_IV_LENGTH_BYTES = 12;

/**
 * AES-GCM authentication tag length in bytes (128 bits)
 *
 * NIST SP 800-38D §5.2.1.1 recommends 128-bit authentication tags
 * This provides 2^-64 probability of acceptance of a forgery (extremely low)
 */
export const ENCRYPTION_AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Maximum input size for encryption (100 KB)
 * Prevents DoS attacks via unbounded encryption operations
 */
export const ENCRYPTION_MAX_INPUT_SIZE = 100000; // bytes
