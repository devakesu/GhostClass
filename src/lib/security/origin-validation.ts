import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

// Module-level cache for allowed hosts.
// Computed lazily on first getAllowedHosts() call, then cached for the process lifetime.
// In development, the cache is invalidated when NEXT_PUBLIC_APP_DOMAIN changes to
// support hot reload without a server restart.
let cachedAllowedHosts: Set<string> | null = null;
let allowedHostsComputed = false;
let cachedAppDomain: string | undefined = undefined;

/** @internal Reset the cached allowed hosts (for testing only). */
export function __resetAllowedHostsCache(): void {
  cachedAllowedHosts = null;
  allowedHostsComputed = false;
  cachedAppDomain = undefined;
}

/**
 * Returns the set of allowed hostnames derived from NEXT_PUBLIC_APP_DOMAIN.
 * Returns null if the env var is unset or blank (misconfiguration).
 *
 * The result is cached for performance. In development, the cache is invalidated
 * automatically when the env var changes (hot reload support).
 *
 * SECURITY: NEXT_PUBLIC_APP_DOMAIN format requirements
 * ====================================================
 * REQUIRED FORMAT: Hostname only, WITHOUT protocol prefix
 *   ✓ Correct: "example.com", "app.example.com", "localhost"
 *   ✗ Wrong:   "https://example.com", "http://localhost:3000"
 *
 * PORTS: If your domain includes a non-standard port (e.g., "localhost:3000"),
 * it will be automatically stripped for origin validation.
 */
export function getAllowedHosts(): Set<string> | null {
  const currentAppDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim();

  // In development, invalidate cache if NEXT_PUBLIC_APP_DOMAIN changes
  if (process.env.NODE_ENV === "development" && allowedHostsComputed && cachedAppDomain !== currentAppDomain) {
    logger.dev(
      "[origin-validation] NEXT_PUBLIC_APP_DOMAIN changed in development. Invalidating cache.",
      { previous: cachedAppDomain, current: currentAppDomain }
    );
    allowedHostsComputed = false;
    cachedAllowedHosts = null;
  }

  if (!allowedHostsComputed) {
    allowedHostsComputed = true;
    cachedAppDomain = currentAppDomain;

    if (!currentAppDomain) {
      cachedAllowedHosts = null;
    } else {
      // Validate that host doesn't include protocol (common misconfiguration)
      if (currentAppDomain.includes("://")) {
        logger.error(
          "[origin-validation] Invalid NEXT_PUBLIC_APP_DOMAIN configuration: value must not include protocol",
          { appDomain: currentAppDomain }
        );
        throw new Error(
          "Configuration error: NEXT_PUBLIC_APP_DOMAIN must be hostname only (e.g., 'example.com', not 'https://example.com')"
        );
      }

      try {
        // Parse as URL to extract hostname (strips port if present)
        cachedAllowedHosts = new Set([new URL(`https://${currentAppDomain}`).hostname.toLowerCase()]);
      } catch {
        // Fallback: assume it's already a bare hostname
        cachedAllowedHosts = new Set([currentAppDomain.toLowerCase()]);
      }

      if (process.env.NODE_ENV === "development") {
        logger.dev(
          "[origin-validation] Allowed hosts computed and cached. " +
          "Cache will be invalidated automatically if NEXT_PUBLIC_APP_DOMAIN changes.",
          { allowedHosts: Array.from(cachedAllowedHosts) }
        );
      }
    }
  }

  return cachedAllowedHosts;
}

/**
 * Normalizes a host header value to a bare lowercase hostname.
 * Handles IPv6 addresses (bracketed and unbracketed), port stripping,
 * and multi-value header lists.
 */
export function normalizeHost(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;

  // IPv6 hosts are commonly bracketed in Host/X-Forwarded-Host headers, e.g. [::1]:3000
  if (first.startsWith("[")) {
    const closingBracketIndex = first.indexOf("]");
    if (closingBracketIndex > 0) {
      return first.slice(1, closingBracketIndex).toLowerCase();
    }
  }

  // Detect unbracketed IPv6 literals. All compressed IPv6 addresses (the common case)
  // contain '::'. Full-form addresses (e.g. "2001:db8:0:0:0:0:0:1") contain multiple
  // colons but no '::'. Guard the latter with a character-set check (hex digits,
  // colons, dots) to avoid a false positive for malformed values like "host:port:extra".
  const isUnbracketedIPv6 =
    first.includes("::") ||
    (/^[\da-fA-F:.]+$/.test(first) && first.indexOf(":") !== first.lastIndexOf(":"));
  if (isUnbracketedIPv6) {
    return first.toLowerCase();
  }

  // Strip optional :port suffix for consistent hostname comparison (IPv4 / hostname only)
  const portSeparatorIndex = first.indexOf(":");
  return (portSeparatorIndex >= 0 ? first.slice(0, portSeparatorIndex) : first).toLowerCase();
}

/**
 * Resolves the effective request hostname from X-Forwarded-Host, Host, or
 * the request URL. Prefers the forwarded host when behind proxies/CDNs.
 */
export function resolveRequestHostname(req: NextRequest): string | null {
  return (
    normalizeHost(req.headers.get("x-forwarded-host")) ??
    normalizeHost(req.headers.get("host")) ??
    normalizeHost(req.nextUrl.hostname)
  );
}
