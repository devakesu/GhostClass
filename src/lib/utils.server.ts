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
import axios from "axios";

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

// ---------------------------------------------------------------------------
// getEgressConfig — resolve the best available EzyGo egress tier at runtime
// ---------------------------------------------------------------------------

/**
 * Returns the base URL and proxy secret header for the highest-priority configured
 * egress tier:
 *   Tier 1 — CF_PROXY_URL       (Cloudflare Worker)       + CF_PROXY_SECRET
 *   Tier 2 — AWS_SECONDARY_URL  (AWS Lambda + API GW)     + AWS_SECONDARY_SECRET
 *   Tier 3 — NEXT_PUBLIC_BACKEND_URL (direct EzyGo)       (no secret header)
 *
 * Use this in server-side API routes that call EzyGo directly (save-token,
 * profile sync, cron sync) so they benefit from the same egress diversity as
 * the client-facing backend proxy route.
 */
export function getEgressConfig(): {
  baseUrl: string;
  proxyHeaders: Record<string, string>;
} {
  const cfProxyUrl = process.env.CF_PROXY_URL?.trim().replace(/\/+$/, "");
  if (cfProxyUrl) {
    const cfProxySecret = process.env.CF_PROXY_SECRET?.trim();
    return {
      baseUrl: cfProxyUrl,
      proxyHeaders: cfProxySecret
        ? { "x-proxy-secret": cfProxySecret }
        : {},
    };
  }

  const awsUrl = process.env.AWS_SECONDARY_URL?.trim().replace(/\/+$/, "");
  if (awsUrl) {
    const awsSecondarySecret = process.env.AWS_SECONDARY_SECRET?.trim();
    return {
      baseUrl: awsUrl,
      proxyHeaders: awsSecondarySecret
        ? { "x-proxy-secret": awsSecondarySecret }
        : {},
    };
  }

  return {
    baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "") ?? "",
    proxyHeaders: {},
  };
}

// ---------------------------------------------------------------------------
// egressFetch — multi-tier fetch wrapper with automatic failover
// ---------------------------------------------------------------------------

// Retryable upstream statuses — mirrors the backend proxy route.
// On these statuses the next configured egress tier is tried transparently.
const RETRYABLE_EGRESS_STATUSES = new Set([429, 502, 503, 504]);

interface EgressTarget {
  readonly baseUrl: string;
  readonly proxyHeaders: Record<string, string>;
  readonly name: string;
}

/**
 * Returns the ordered list of configured egress targets:
 *   Tier 1 — CF_PROXY_URL      (Cloudflare Worker, optional)
 *   Tier 2 — AWS_SECONDARY_URL (AWS Lambda, optional)
 *   Tier 3 — NEXT_PUBLIC_BACKEND_URL (direct EzyGo, always present when set)
 * Each tier is included only when its URL env var is non-empty.
 */
function buildEgressTargets(): EgressTarget[] {
  const targets: EgressTarget[] = [];

  const cfUrl = process.env.CF_PROXY_URL?.trim().replace(/\/+$/, "");
  if (cfUrl) {
    const secret = process.env.CF_PROXY_SECRET?.trim();
    targets.push({ baseUrl: cfUrl, proxyHeaders: secret ? { "x-proxy-secret": secret } : {}, name: "primary (CF Worker)" });
  }

  const awsUrl = process.env.AWS_SECONDARY_URL?.trim().replace(/\/+$/, "");
  if (awsUrl) {
    const secret = process.env.AWS_SECONDARY_SECRET?.trim();
    targets.push({ baseUrl: awsUrl, proxyHeaders: secret ? { "x-proxy-secret": secret } : {}, name: "secondary (AWS)" });
  }

  const directUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (directUrl) {
    targets.push({ baseUrl: directUrl, proxyHeaders: {}, name: "direct" });
  }

  return targets;
}

/**
 * Fetch wrapper for server-side EzyGo calls with multi-tier egress failover.
 *
 * Loops through the configured tiers (CF Worker → AWS Lambda → direct EzyGo)
 * and transparently fails over on 429 / 502 / 503 / 504 responses or network
 * errors. Non-retryable statuses (most 4xx) are returned immediately without
 * retrying on other tiers. Callers supply only the endpoint path and their own
 * headers (e.g. Authorization); proxy secrets are injected automatically per tier.
 */
export async function egressFetch(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const targets = buildEgressTargets();
  if (targets.length === 0) {
    throw new Error("No egress targets configured — NEXT_PUBLIC_BACKEND_URL is not set");
  }

  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  let lastResponse: Response | undefined;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const isLast = i === targets.length - 1;
    const url = `${target.baseUrl}/${cleanEndpoint}`;

    // Merge caller headers then apply per-tier proxy headers (proxy secret takes precedence).
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(target.proxyHeaders)) {
      headers.set(key, value);
    }

    try {
      const res = await fetch(url, { ...init, headers });

      if (RETRYABLE_EGRESS_STATUSES.has(res.status) && !isLast) {
        // console.warn used deliberately — see logger import note at top of utils.server.ts.
        console.warn(
          `[egress-failover] ${target.name} returned ${res.status} for ${cleanEndpoint} — failing over to next tier`
        );
        // Drain the body to release the connection before trying the next tier.
        await res.body?.cancel?.();
        lastResponse = res;
        continue;
      }

      return res;
    } catch (err) {
      if (isLast) throw err;
      // console.warn used deliberately — see logger import note at top of utils.server.ts.
      console.warn(
        `[egress-failover] ${target.name} failed for ${cleanEndpoint} — failing over to next tier:`,
        err instanceof Error ? err.message : String(err)
      );
      continue;
    }
  }

  // Only reached when every non-last tier returned a retryable status.
  // Return the last captured response so the caller can inspect its status.
  return lastResponse!;
}

// ---------------------------------------------------------------------------
// egressAxios — server-only Axios instance pre-wired for EzyGo egress
// ---------------------------------------------------------------------------

/**
 * Server-only Axios instance for EzyGo calls. A request interceptor resolves
 * the highest-priority egress tier and injects the baseURL and proxy secret
 * header before each request. Callers supply only the endpoint path (no base
 * URL, no proxy headers) and their own Authorization header.
 */
const _egressAxios = axios.create({ timeout: 15000 });
_egressAxios.interceptors.request.use((config) => {
  const { baseUrl, proxyHeaders } = getEgressConfig();
  config.baseURL = baseUrl;
  for (const [key, value] of Object.entries(proxyHeaders)) {
    config.headers.set(key, value);
  }
  return config;
});
export { _egressAxios as egressAxios };

