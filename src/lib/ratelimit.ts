// src/lib/ratelimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Configurable rate limiter for different endpoints
 *
 * Environment variables:
 * - SYNC_RATE_LIMIT_REQUESTS / SYNC_RATE_LIMIT_WINDOW   — cron sync endpoint (default 10/10 s)
 * - CONTACT_RATE_LIMIT_REQUESTS / CONTACT_RATE_LIMIT_WINDOW — contact form (default 10/10 s)
 * - AUTH_RATE_LIMIT_REQUESTS / AUTH_RATE_LIMIT_WINDOW   — auth endpoints (default 5/60 s)
 *
 * Sync and contact limits are now independently configurable. Previously both
 * shared RATE_LIMIT_REQUESTS/RATE_LIMIT_WINDOW, meaning tightening one tightened the
 * other. RATE_LIMIT_* env vars are kept as a convenience fallback for both when the
 * specific var is absent.
 */

// Generic fallback (used when endpoint-specific vars are absent)
const RATE_LIMIT_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || "10", 10);
const RATE_LIMIT_WINDOW   = parseInt(process.env.RATE_LIMIT_WINDOW   || "10", 10);

// Validate shared fallback values
// Error messages use "[value redacted]" instead of the raw env var value to
// avoid exposing attacker-influenced config values in deployment logs.
if (!Number.isFinite(RATE_LIMIT_REQUESTS) || RATE_LIMIT_REQUESTS < 1 || RATE_LIMIT_REQUESTS > 1000) {
  throw new Error(`RATE_LIMIT_REQUESTS must be between 1-1000, got: [value redacted]`);
}
if (!Number.isFinite(RATE_LIMIT_WINDOW) || RATE_LIMIT_WINDOW < 1 || RATE_LIMIT_WINDOW > 3600) {
  throw new Error(`RATE_LIMIT_WINDOW must be between 1-3600 seconds, got: [value redacted]`);
}

// Sync-specific limits (fall back to shared defaults)
const SYNC_LIMIT  = parseInt(process.env.SYNC_RATE_LIMIT_REQUESTS || String(RATE_LIMIT_REQUESTS), 10);
const SYNC_WINDOW = parseInt(process.env.SYNC_RATE_LIMIT_WINDOW   || String(RATE_LIMIT_WINDOW),   10);
if (!Number.isFinite(SYNC_LIMIT)  || SYNC_LIMIT  < 1 || SYNC_LIMIT  > 1000) throw new Error(`SYNC_RATE_LIMIT_REQUESTS must be between 1-1000, got: [value redacted]`);
if (!Number.isFinite(SYNC_WINDOW) || SYNC_WINDOW < 1 || SYNC_WINDOW > 3600) throw new Error(`SYNC_RATE_LIMIT_WINDOW must be between 1-3600 seconds, got: [value redacted]`);

// Contact-form-specific limits (fall back to shared defaults)
const CONTACT_LIMIT  = parseInt(process.env.CONTACT_RATE_LIMIT_REQUESTS || String(RATE_LIMIT_REQUESTS), 10);
const CONTACT_WINDOW = parseInt(process.env.CONTACT_RATE_LIMIT_WINDOW   || String(RATE_LIMIT_WINDOW),   10);
if (!Number.isFinite(CONTACT_LIMIT)  || CONTACT_LIMIT  < 1 || CONTACT_LIMIT  > 1000) throw new Error(`CONTACT_RATE_LIMIT_REQUESTS must be between 1-1000, got: [value redacted]`);
if (!Number.isFinite(CONTACT_WINDOW) || CONTACT_WINDOW < 1 || CONTACT_WINDOW > 3600) throw new Error(`CONTACT_RATE_LIMIT_WINDOW must be between 1-3600 seconds, got: [value redacted]`);

// Parse and validate auth rate limit settings
const AUTH_LIMIT = parseInt(process.env.AUTH_RATE_LIMIT_REQUESTS || "5", 10);
const AUTH_WINDOW = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW || "60", 10);

if (!Number.isFinite(AUTH_LIMIT) || AUTH_LIMIT < 1 || AUTH_LIMIT > 1000) {
  throw new Error(`AUTH_RATE_LIMIT_REQUESTS must be between 1-1000, got: [value redacted]`);
}
if (!Number.isFinite(AUTH_WINDOW) || AUTH_WINDOW < 1 || AUTH_WINDOW > 3600) {
  throw new Error(`AUTH_RATE_LIMIT_WINDOW must be between 1-3600 seconds, got: [value redacted]`);
}
// Log configuration in development
if (process.env.NODE_ENV === 'development') {
  logger.dev(`[Rate Limit] sync=${SYNC_LIMIT}/${SYNC_WINDOW}s  contact=${CONTACT_LIMIT}/${CONTACT_WINDOW}s`);
  logger.dev(`[Auth Rate Limit] ${AUTH_LIMIT} requests per ${AUTH_WINDOW}s`);
}

// Create rate limiter instances once at module load time.
// Separate prefixes ensure that contact-form traffic cannot starve the cron-sync
// rate-limit budget (and vice-versa).
const syncLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(SYNC_LIMIT, `${SYNC_WINDOW} s`),
  analytics: true,
  prefix: "@ghostclass/sync-ratelimit",
});

const contactLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(CONTACT_LIMIT, `${CONTACT_WINDOW} s`),
  analytics: true,
  prefix: "@ghostclass/contact-ratelimit",
});

const authLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(AUTH_LIMIT, `${AUTH_WINDOW} s`),
  analytics: true,
  prefix: "@ghostclass/auth-ratelimit",
});

/** Rate limiter for cron sync endpoint */
export const syncRateLimiter = syncLimiter;

/** Rate limiter for contact form submissions */
export const contactRateLimiter = contactLimiter;

/** Stricter rate limiter for authentication endpoints */
export const authRateLimiter = authLimiter;