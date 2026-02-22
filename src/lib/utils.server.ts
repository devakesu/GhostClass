/**
 * Server-only utility functions — enforced via the 'server-only' guard.
 *
 * API routes, middleware, and server actions should import from this module
 * rather than from @/lib/utils to make the server/client boundary explicit.
 * The 'server-only' guard causes a build-time error if any client bundle
 * transitively imports from this module.
 */
import "server-only";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// redact — HMAC-SHA256 implementation (server only)
// ---------------------------------------------------------------------------

// SECRET and secretWarningShown are module-level mutable state. The only
// legitimate writers are getSecret() (single initialisation). TypeScript does not
// prevent other code in this module from assigning to them directly; a future
// refactor to a closure module would eliminate that risk.
// DO NOT write to these variables outside getSecret().
let SECRET: string | null = null;
let secretWarningShown = false;

function getSecret(): string {
  if (SECRET !== null) return SECRET;

  if (process.env.SENTRY_HASH_SALT) {
    SECRET = process.env.SENTRY_HASH_SALT;
    return SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SENTRY_HASH_SALT is required in production");
  }

  // NODE_ENV === "test" included so Vitest runs without SENTRY_HASH_SALT don't throw.
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    if (process.env.NODE_ENV === "development" && !secretWarningShown) {
      // console.warn used deliberately — importing logger here would create a
      // circular-dependency risk (logger → utils hypothetically possible in future).
      console.warn(
        "[SECURITY WARNING] Using fallback salt for redaction. " +
        "Set SENTRY_HASH_SALT environment variable for production-like hashing. " +
        "Development logs with this salt will produce different hashes than production logs."
      );
      secretWarningShown = true;
    }
    SECRET = "dev-salt-only";
    return SECRET;
  }

  throw new Error("SENTRY_HASH_SALT is required in production");
}

/**
 * Redacts sensitive data (email, ID) for safe server-side logging using HMAC-SHA256.
 * Produces a 12-character deterministic hash keyed on SENTRY_HASH_SALT.
 *
 * Use this in API routes and server actions. Client components should use the
 * `redact` export from @/lib/utils, which uses a crypto-import-free implementation.
 *
 * @param type  - Type of data being redacted ('email' or 'id')
 * @param value - The sensitive value to redact
 * @returns A 12-character deterministic hex string safe for logging
 */
export const redact = (type: "email" | "id", value: string): string =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`${type}:${value}`)
    .digest("hex")
    .slice(0, 12);

// ---------------------------------------------------------------------------
// getClientIp — server only (reads request headers)
// ---------------------------------------------------------------------------

// Track if we've already logged the development IP warning to avoid spam
let hasLoggedDevIpWarning = false;

/**
 * Extracts the client IP address from request headers.
 *
 * Header priority (assumes Cloudflare as primary CDN):
 *   1. cf-connecting-ip — Most trusted when behind Cloudflare
 *   2. x-real-ip — Common for nginx/Apache reverse proxies
 *   3. x-forwarded-for — First IP in chain (various load-balancers)
 *
 * In development, falls back to TEST_CLIENT_IP env var or "127.0.0.1".
 * In production, returns null when no valid header is present (caller must reject).
 *
 * @param headerList - The Headers object from the request
 * @returns The client IP address or null if it cannot be determined
 */
export function getClientIp(headerList: Headers): string | null {
  const cf = headerList.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headerList.get("x-forwarded-for");
  const forwardedIp = forwarded?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp;

  if (process.env.NODE_ENV === "development") {
    const testIp = process.env.TEST_CLIENT_IP;

    if (!hasLoggedDevIpWarning) {
      hasLoggedDevIpWarning = true;
      // console.warn used deliberately — see logger import note at top of utils.ts.
      console.warn(
        "\n" +
        "═══════════════════════════════════════════════════════════════════════\n" +
        "⚠️  DEVELOPMENT MODE: Client IP Detection\n" +
        "═══════════════════════════════════════════════════════════════════════\n" +
        "No IP forwarding headers found. This affects IP-based security features\n" +
        "such as rate limiting, geolocation, and audit logging.\n\n" +
        "To test real IP logic in development:\n" +
        "  1. Set TEST_CLIENT_IP environment variable (e.g., TEST_CLIENT_IP=203.0.113.45)\n" +
        "  2. Or send x-real-ip or cf-connecting-ip headers in your requests\n" +
        `\nCurrent fallback: ${testIp || "127.0.0.1"}\n` +
        "═══════════════════════════════════════════════════════════════════════\n"
      );
    }

    return testIp || "127.0.0.1";
  }

  // In production, return null to signal that IP extraction failed.
  // Callers must handle this null case (e.g. reject the request).
  // console.warn used deliberately — see logger import note at top of utils.ts.
  console.warn(
    "[getClientIp] No IP forwarding headers found in production. " +
    "Ensure reverse proxy is configured to set x-forwarded-for, x-real-ip, or cf-connecting-ip headers. " +
    "Request will be rejected if IP is required for security checks."
  );
  return null;
}

