export function isCookieSecure(): boolean {
  // Use NODE_ENV=production as the authoritative indicator of production
  // deployment; fall back to HTTPS env var for legacy environments.
  return process.env.NODE_ENV === "production" || process.env.HTTPS === "true";
}

/**
 * Standardized cookie maxAge duration constants (in seconds).
 */
export const COOKIE_MAX_AGE_5_MINUTES = 5 * 60; // 300
export const COOKIE_MAX_AGE_24_HOURS = 24 * 60 * 60; // 86400
export const COOKIE_MAX_AGE_7_DAYS = 7 * 24 * 60 * 60; // 604800
export const COOKIE_MAX_AGE_31_DAYS = 31 * 24 * 60 * 60; // 2678400
export const COOKIE_MAX_AGE_1_YEAR = 365 * 24 * 60 * 60; // 31536000
