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

let SECRET: string | null = null;
let secretWarningShown = false;
let hasLoggedDevIpWarning = false;

/**
 * TEST ONLY — Resets module-level state.
 */
export function _resetModuleState() {
  SECRET = null;
  secretWarningShown = false;
  hasLoggedDevIpWarning = false;
}

function getSecret(): string {
  // eslint-disable-next-line security/detect-possible-timing-attacks -- Checking module variable initialization, not comparing secret values
  if (SECRET !== null) return SECRET;

  if (process.env.SENTRY_HASH_SALT) {
    SECRET = process.env.SENTRY_HASH_SALT;
    return SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SENTRY_HASH_SALT is required in production");
  }

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    if (process.env.NODE_ENV === "development" && !secretWarningShown) {
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
 */
export const redact = (type: "email" | "id" | "username", value: string): string =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`${type}:${value}`)
    .digest("hex")
    .slice(0, 12);

// ---------------------------------------------------------------------------
// getClientIp — server only (reads request headers)
// ---------------------------------------------------------------------------

/**
 * Extracts the client IP address from request headers.
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

  console.warn(
    "[getClientIp] No IP forwarding headers found in production. " +
    "Ensure reverse proxy is configured to set x-forwarded-for, x-real-ip, or cf-connecting-ip headers. " +
    "Request will be rejected if IP is required for security checks."
  );
  return null;
}

// ---------------------------------------------------------------------------
// egressFetch — multi-tier fetch wrapper with automatic failover
// ---------------------------------------------------------------------------

const RETRYABLE_EGRESS_STATUSES = new Set([429, 502, 503, 504]);
const PER_TIER_TIMEOUT_MS = 10_000;

interface EgressTarget {
  readonly baseUrl: string;
  readonly proxyHeaders: Record<string, string>;
  readonly name: string;
}

function stripTrailingSlashes(str: string | undefined): string | undefined {
  if (!str) return str;
  let s = str.trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

function buildEgressTargets(): EgressTarget[] {
  const targets: EgressTarget[] = [];

  const cfUrl = stripTrailingSlashes(process.env.CF_PROXY_URL);
  if (cfUrl) {
    const secret = process.env.CF_PROXY_SECRET?.trim();
    targets.push({ baseUrl: cfUrl, proxyHeaders: secret ? { "x-proxy-secret": secret } : {}, name: "primary (CF Worker)" });
  }

  const awsUrl = stripTrailingSlashes(process.env.AWS_SECONDARY_URL);
  if (awsUrl) {
    const secret = process.env.AWS_SECONDARY_SECRET?.trim();
    targets.push({ baseUrl: awsUrl, proxyHeaders: secret ? { "x-proxy-secret": secret } : {}, name: "secondary (AWS)" });
  }

  const directUrl = stripTrailingSlashes(process.env.NEXT_PUBLIC_BACKEND_URL);
  if (directUrl) {
    targets.push({ baseUrl: directUrl, proxyHeaders: {}, name: "direct" });
  }

  return targets;
}

async function populateStealthHeaders(headers: Headers, targetHeaders: Record<string, string>): Promise<void> {
  if (!headers.has("origin")) headers.set("origin", "https://edu.ezygo.app");
  if (!headers.has("referer")) headers.set("referer", "https://edu.ezygo.app/");

  let originalUserAgent: string | null = null;
  let originalSecChUa: string | null = null;
  try {
    const { headers: nextHeaders } = await import("next/headers");
    const activeHeaders = await nextHeaders();
    originalUserAgent = activeHeaders.get("user-agent");
    originalSecChUa = activeHeaders.get("sec-ch-ua");
  } catch {
    // Not in a request context
  }

  if (!headers.has("user-agent")) {
    headers.set("user-agent", originalUserAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
  }
  if (!headers.has("sec-ch-ua") && originalSecChUa) {
    headers.set("sec-ch-ua", originalSecChUa);
  }
  
  if (!headers.has("accept")) headers.set("accept", "application/json, text/plain, */*");
  if (!headers.has("accept-language")) headers.set("accept-language", "en-GB,en;q=0.9,en;q=0.8");
  if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-site");
  if (!headers.has("sec-fetch-mode")) headers.set("sec-fetch-mode", "cors");
  if (!headers.has("sec-fetch-dest")) headers.set("sec-fetch-dest", "empty");
  if (!headers.has("priority")) headers.set("priority", "u=1, i");

  for (const [key, value] of Object.entries(targetHeaders)) {
    headers.set(key, value);
  }
}

async function attemptEgressTier(
  target: EgressTarget,
  cleanEndpoint: string,
  init: RequestInit | undefined,
  callerSignal: AbortSignal | null,
  isLast: boolean
): Promise<{ success: true; res: Response } | { success: false; shouldThrow: boolean; error?: unknown }> {
  const url = `${target.baseUrl}/${cleanEndpoint}`;
  const headers = new Headers(init?.headers);
  await populateStealthHeaders(headers, target.proxyHeaders);

  const tierController = new AbortController();
  const tierTimeout = setTimeout(() => tierController.abort(), PER_TIER_TIMEOUT_MS);
  const tierSignal: AbortSignal =
    callerSignal !== null
      ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([callerSignal, tierController.signal])
      : tierController.signal;

  try {
    const res = await fetch(url, { ...init, headers, signal: tierSignal });
    clearTimeout(tierTimeout);

    if (RETRYABLE_EGRESS_STATUSES.has(res.status) && !isLast) {
      console.warn(
        `[egress-failover] ${target.name} returned ${res.status} for ${cleanEndpoint} — failing over to next tier`
      );
      await res.body?.cancel?.();
      return { success: false, shouldThrow: false };
    }

    return { success: true, res };
  } catch (err) {
    clearTimeout(tierTimeout);
    if (callerSignal?.aborted && err instanceof Error && err.name === "AbortError") {
      return { success: false, shouldThrow: true, error: err };
    }
    if (isLast) {
      return { success: false, shouldThrow: true, error: err };
    }
    console.warn(
      `[egress-failover] ${target.name} failed for ${cleanEndpoint} — failing over to next tier:`,
      err instanceof Error ? err.message : String(err)
    );
    return { success: false, shouldThrow: false };
  }
}

/**
 * Fetch wrapper for server-side EzyGo calls with multi-tier egress failover.
 */
export async function egressFetch(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const targets = buildEgressTargets();
  if (targets.length === 0) {
    throw new Error("No egress targets configured — set NEXT_PUBLIC_BACKEND_URL, CF_PROXY_URL, or AWS_SECONDARY_URL");
  }

  let cleanEndpoint = endpoint.trim();
  while (cleanEndpoint.startsWith("/")) {
    cleanEndpoint = cleanEndpoint.slice(1);
  }
  const callerSignal = init?.signal ?? null;

  for (const [i, target] of targets.entries()) {
    const isLast = i === targets.length - 1;
    const attempt = await attemptEgressTier(target, cleanEndpoint, init, callerSignal, isLast);
    if (attempt.success) {
      return attempt.res;
    }
    if (attempt.shouldThrow) {
      throw attempt.error;
    }
  }

  throw new Error("[egress-failover] unreachable: exhausted all egress tiers without returning");
}
