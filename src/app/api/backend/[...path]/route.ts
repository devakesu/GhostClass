import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { validateCsrfToken } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { ezygoCircuitBreaker, CircuitBreakerOpenError, UpstreamServerError, NonBreakerError } from "@/lib/circuit-breaker";

// .trim() removes accidental leading/trailing whitespace from the env value
// (common copy-paste mistake in .env files) before stripping trailing slashes.
const BASE_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");

// Runtime validation: ensure NODE_ENV is explicitly set at module load time
// SECURITY CONSIDERATION: When NODE_ENV is undefined, IS_PRODUCTION will be false,
// resulting in development mode behavior (verbose error messages exposed to clients).
// This is intentional - we log an error to alert monitoring systems but continue
// execution to avoid breaking the application. The default to development mode is
// safer than throwing an error (which would cause a service outage).
// CRITICAL: CI/CD pipelines MUST enforce NODE_ENV=production for production deployments.
if (!process.env.NODE_ENV) {
  logger.error("CRITICAL: NODE_ENV is not set - defaulting to development mode with verbose error messages. This MUST be fixed in production.");
}
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// PUBLIC_PATHS: Exact endpoints that are exempt from CSRF validation AND from origin validation.
// Uses full path matching (not prefix) to prevent accidentally exposing sensitive sub-paths.
// 
// SECURITY MODEL FOR PUBLIC PATHS:
// These paths are accessible without authentication but still require proper security controls:
// 
// 1. Origin Validation (SKIPPED for public paths; enforced for all non-public paths):
//    - Non-public paths require a valid Origin header matching NEXT_PUBLIC_APP_DOMAIN for
//      both read (GET) and write (POST/PUT/PATCH/DELETE) requests.
//    - Public paths (e.g. login) are exempt because the user has no session yet.
//    - Verifies requests originate from the allowed domain (NEXT_PUBLIC_APP_DOMAIN)
//    - Prevents unauthorized sites from making requests even on GET (data-exfiltration protection)
//    
//    ⚠️ IMPORTANT: Origin validation restricts access to web browsers from allowed domains.
//    Non-browser clients (mobile apps, CLI tools, Postman, curl) will be BLOCKED unless they:
//    - Send a valid Origin header matching NEXT_PUBLIC_APP_DOMAIN, OR
//    - Use a different authentication flow (API keys, OAuth tokens, etc.)
//    
//    If you need to support non-browser clients, consider:
//    - Creating separate API endpoints for programmatic access (e.g., /api/v1/auth/login)
//    - Implementing API key authentication for machine-to-machine communication
//    - Using OAuth 2.0 client credentials flow for third-party integrations
//    - Documenting that the web API is browser-only in your API documentation
// 
// 2. CSRF Protection (SKIPPED for public paths):
//    - Not applicable since user has no session/token yet (e.g., login endpoint)
//    - Origin validation provides baseline protection for these pre-auth endpoints
// 
// 3. Additional Security (endpoint-specific):
//    - Rate limiting (prevents brute force on login)
//    - Request validation (input sanitization, schema validation)
//    - Captcha/bot detection (for signup, password reset)
//    - Account lockout policies (for repeated failed logins)
// 
// VERIFICATION: Each path in PUBLIC_PATHS has been reviewed for security:
// - "login": Pre-authentication endpoint protected by:
//   * Rate limiting (prevents brute force)
//   * Input validation (sanitizes username/password)
//   * Backend authentication logic (validates credentials)
// 
// SECURITY: Each path must be explicitly listed - sub-paths are NOT automatically included.
// Example: "login" matches "/api/backend/login" but NOT "/api/backend/login/admin".
//          To allow both, add both "login" and "login/admin" as separate entries.
// 
// Add paths as segments WITHOUT leading slashes, using "/" for sub-paths:
//   ✓ Correct: "login", "login/refresh", "health", "status/check"
//   ✗ Wrong:   "/login", "login/", "/health/"
// 
// Review carefully before adding new paths to ensure no sensitive endpoints are exposed.
const PUBLIC_PATHS = new Set([
  "login",
  // Add additional public paths here with explicit full paths
  // Each path must have its own security measures (rate limiting, validation, etc.)
  // Examples:
  // "health",              // would match /api/backend/health
  // "status/check",        // would match /api/backend/status/check
  // "login/refresh",       // would match /api/backend/login/refresh
]);

// Memoized allowed hosts computation for performance
// Computed lazily on first call, then cached for subsequent requests
// CACHE BEHAVIOR: The allowed hosts are computed once during application lifetime
// and never updated. If NEXT_PUBLIC_APP_DOMAIN changes (e.g., during hot reload
// in development), the application must be restarted for the cache to refresh.
// This is acceptable in production where environment variables are immutable,
// but developers should be aware of this limitation in development.
let cachedAllowedHosts: Set<string> | null = null;
let allowedHostsComputed = false;
let cachedAppDomain: string | undefined = undefined;

function getAllowedHosts(): Set<string> | null {
  const currentAppDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim();
  
  // In development, invalidate cache if NEXT_PUBLIC_APP_DOMAIN changes
  // This allows hot reload to pick up environment variable changes without restart
  if (process.env.NODE_ENV === "development" && allowedHostsComputed && cachedAppDomain !== currentAppDomain) {
    logger.dev(
      "[backend-proxy] NEXT_PUBLIC_APP_DOMAIN changed in development. Invalidating cache.",
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
      // SECURITY: NEXT_PUBLIC_APP_DOMAIN format requirements
      // ====================================================
      // REQUIRED FORMAT: Hostname only, WITHOUT protocol prefix
      //   ✓ Correct: "example.com", "app.example.com", "localhost"
      //   ✗ Wrong:   "https://example.com", "http://localhost:3000"
      //
      // PORTS: If your domain includes a non-standard port (e.g., "localhost:3000"),
      // it will be automatically stripped for origin validation. This is intentional
      // to match standard browser behavior where Origin headers contain ports but
      // hostname comparisons typically exclude them.
      //
      // This format is enforced in .example.env and must be consistent across all
      // environment files. Inconsistent formats can cause security validation failures.
      //
      // Extract hostname without port for consistent comparison
      cachedAllowedHosts = new Set(
        [currentAppDomain].map((host) => {
          // Validate that host doesn't include protocol (common misconfiguration)
          if (host.includes("://")) {
            logger.error(
              "[backend-proxy] Invalid NEXT_PUBLIC_APP_DOMAIN configuration: value must not include protocol",
              { appDomain: host }
            );
            throw new Error(
              "Configuration error: NEXT_PUBLIC_APP_DOMAIN must be hostname only (e.g., 'example.com', not 'https://example.com')"
            );
          }
          
          try {
            // Parse as URL to extract hostname (strips port if present)
            return new URL(`https://${host}`).hostname.toLowerCase();
          } catch {
            // Fallback: assume it's already a hostname
            return host.toLowerCase();
          }
        })
      );
      
      // In development, log cache information to help developers understand behavior
      if (process.env.NODE_ENV === "development") {
        logger.dev(
          "[backend-proxy] Allowed hosts computed and cached. " +
          "Cache will be invalidated automatically if NEXT_PUBLIC_APP_DOMAIN changes.",
          { allowedHosts: Array.from(cachedAllowedHosts) }
        );
      }
    }
  }
  
  return cachedAllowedHosts;
}

// Maximum response size limit (3MB). This accommodates bulk data exports and large
// institutional datasets while preventing memory exhaustion from unbounded responses.
// Responses exceeding this limit will be rejected with an error.
const MAX_RESPONSE_BYTES = 3_000_000;
const UPSTREAM_TIMEOUT_MS = 15_000;
// Maximum length of error body to log. Truncate longer error bodies to prevent
// exposing sensitive information in server logs (database errors, internal paths, etc.)
const MAX_ERROR_BODY_LOG_LENGTH = 500;

/**
 * Custom error for oversized upstream responses
 * This is a local safety limit, not an upstream failure, so it should not trip the circuit breaker
 */
class UpstreamResponseTooLargeError extends NonBreakerError {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamResponseTooLargeError';
  }
}

async function readWithLimit(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!body) return "";
  const reader = body.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) {
        const abortError = new Error("Upstream fetch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (value) {
        received += value.length;
        if (received > limit) {
          throw new UpstreamResponseTooLargeError("Upstream response exceeded safety limit");
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    // Cancel the reader to release the stream lock and prevent memory leaks from
    // half-read streams on all error paths (abort, size limit, network errors).
    try { await reader.cancel(); } catch { /* ignore cancellation errors */ }
    throw error;
  }

  return Buffer.concat(chunks).toString("utf8");
}

// Not exported: the four HTTP handler exports (GET/POST/PUT/PATCH/DELETE) are the
// Next.js entry points. Exporting forward() directly would allow any server-side
// module to call it with an arbitrary method and path[], bypassing the PUBLIC_PATHS
// check, origin validation, and CSRF protection.
async function forward(req: NextRequest, method: string, path: string[]) {
  if (!BASE_API_URL) {
    logger.error("NEXT_PUBLIC_BACKEND_URL is not configured");
    return NextResponse.json({ message: "Backend URL not configured" }, { status: 500 });
  }

  if (BASE_API_URL?.includes("localhost:3000")) {
    logger.error("Misconfigured NEXT_PUBLIC_BACKEND_URL: points to Next app (3000), causing proxy loop");
    return NextResponse.json({ message: "Backend URL misconfigured" }, { status: 500 });
  }

  const pathSegments = path ?? [];
  if (pathSegments.length === 0) {
    return NextResponse.json({ message: "Missing path" }, { status: 400 });
  }

  const isWrite = method !== "GET" && method !== "HEAD";
  
  // SECURITY: Path matching for PUBLIC_PATHS whitelist
  // Next.js route params ([...path]) automatically exclude query parameters and fragments,
  // but we explicitly validate this to prevent potential bypass attacks. An attacker cannot
  // bypass protection by adding ?query or #fragment because those are stripped by Next.js
  // before reaching this handler.
  // 
  // Additional safety: Check that no path segment contains '?' or '#' characters
  // (this should never happen with Next.js routing, but defense in depth)
  const hasInvalidChars = pathSegments.some(segment => 
    segment.includes('?') || segment.includes('#')
  );
  if (hasInvalidChars) {
    logger.warn("[backend-proxy] Path segments contain query or fragment characters", {
      path: pathSegments,
      method
    });
    return NextResponse.json({ message: "Invalid path format" }, { status: 400 });
  }
  
  // Check for exact path match (join all segments to compare against full paths in PUBLIC_PATHS)
  const fullPath = pathSegments.join("/");
  const isPublic = PUBLIC_PATHS.has(fullPath);

  // Origin validation for ALL non-public requests (reads and writes).
  // - Writes (POST/PUT/PATCH/DELETE): always enforced to prevent CSRF-style attacks.
  // - Authenticated GETs (non-public paths): enforced to prevent cross-origin data
  //   exfiltration (e.g. an attacker forcing a victim's browser to fetch attendance
  //   records via <img>, <script>, or fetch from a malicious site).
  // Public paths (e.g. login) are exempt because the user has no session yet.
  // SKIP in development mode for easier local testing with localhost, tunnels, etc.
  if (!isPublic && process.env.NODE_ENV !== "development") {
    // Validate that NEXT_PUBLIC_APP_DOMAIN is configured
    const allowedHosts = getAllowedHosts();
    if (!allowedHosts) {
      logger.error("NEXT_PUBLIC_APP_DOMAIN is not configured - origin validation cannot proceed");
      return NextResponse.json(
        { message: "Server configuration error: security validation unavailable" },
        { status: 500 }
      );
    }

    const origin = req.headers.get("origin");
    if (!origin) {
      // Provide helpful error message for non-browser clients
      return NextResponse.json({ 
        message: "Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication." 
      }, { status: 400 });
    }
    try {
      // Use .hostname (not .host) to exclude port and properly handle IPv6 addresses
      const originHostname = new URL(origin).hostname.toLowerCase();
      // Strict allowlist - don't fall back to Host header which can be spoofed
      if (!allowedHosts.has(originHostname)) {
        // Log for monitoring potential attacks or misconfigured clients
        logger.warn("Origin validation failed", { 
          origin: originHostname, 
          path: fullPath,
          method 
        });
        return NextResponse.json({ 
          message: "Origin not allowed. This endpoint only accepts requests from authorized domains." 
        }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "Invalid origin header format" }, { status: 400 });
    }
  }

  // CSRF protection for authenticated state-changing calls only (excludes public paths)
  if (isWrite && !isPublic) {
    const csrfToken = req.headers.get("x-csrf-token");
    const csrfOk = await validateCsrfToken(csrfToken);
    if (!csrfOk) {
      return NextResponse.json({ message: "Invalid CSRF token" }, { status: 403 });
    }
  }

  const token = isPublic ? undefined : await getAuthTokenServer();

  // Guard: if the EzyGo auth cookie is missing for a non-public path the request
  // cannot succeed. Return 401 immediately rather than forwarding
  // `Authorization: Bearer undefined` to the upstream, which would waste a round-trip
  // and could confuse the upstream into returning a less descriptive error.
  if (!isPublic && !token) {
    return NextResponse.json(
      { message: "No authentication token – please log in again" },
      { status: 401 }
    );
  }

  const target = `${BASE_API_URL}/${pathSegments.join("/")}${req.nextUrl.search}`;

  const hasBody = method !== "GET" && method !== "HEAD";
  let body: BodyInit | undefined;

  // Track the content-type that corresponds to how the body was actually read,
  // so we forward a type that precisely matches the payload rather than blindly
  // trusting the client-supplied header. A malicious client could inject exotic types
  // or attacker-controlled boundary parameters that the upstream might mishandle.
  let resolvedContentType = "application/json";

  if (hasBody) {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.text();
      resolvedContentType = "application/json";
    } else {
      body = Buffer.from(await req.arrayBuffer());
      // Forward only the media type ("type/subtype"), stripping all parameters such as
      // multipart boundaries. This removes the attack surface of attacker-controlled
      // boundary strings while still telling the upstream what kind of data was sent.
      const mediaType = contentType.split(";")[0].trim().toLowerCase();
      resolvedContentType = mediaType || "application/octet-stream";
    }
  }

  try {
    // Wrap fetch in circuit breaker for automatic failure handling
    // This protects against cascading failures when EzyGo API is down
    const result = await ezygoCircuitBreaker.execute(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      try {
        const res = await fetch(target, {
          method,
          headers: {
            ...(isPublic ? {} : { Authorization: `Bearer ${token}` }),
            "content-type": resolvedContentType, // derived from how the body was read, not raw client header
            accept: req.headers.get("accept") || "application/json",
          },
          body: hasBody ? body : undefined,
          // duplex is required for streaming request bodies
          // See: https://github.com/nodejs/undici/issues/1583
          ...(hasBody ? { duplex: "half" as const } : {}),
          signal: controller.signal,
        });

        const text = await readWithLimit(res.body, MAX_RESPONSE_BYTES, controller.signal);

        // Check for server errors (5xx) and rate limiting (429) and throw to trip circuit breaker
        // Use UpstreamServerError to preserve response details for proper proxying
        // 429 is treated as a breaker-worthy error to prevent retry storms during upstream rate limiting
        if (res.status >= 500 || res.status === 429) {
          throw new UpstreamServerError(
            `Upstream server error: ${res.status} ${res.statusText}`,
            res.status,
            res.statusText,
            text,
            res.headers
          );
        }
        
        // Always return consistent shape
        return { res, text };
      } finally {
        clearTimeout(timeout);
      }
    });

    const { res, text } = result;
    const contentType = res.headers.get("content-type") || "application/json";

    if (!res.ok) {
      // Sanitize error body for logging to avoid exposing sensitive information
      // Even in server logs, we should be careful about what we log from upstream errors
      const sanitizedBody = text.length > MAX_ERROR_BODY_LOG_LENGTH 
        ? text.substring(0, MAX_ERROR_BODY_LOG_LENGTH) + '...' 
        : text;
      // Log path only — `target` includes the full upstream base URL and any
      // user-supplied query string; both leak to log aggregators.
      logger.error("Proxy upstream error", { 
        status: res.status, 
        path: pathSegments.join("/"),
        bodyPreview: sanitizedBody 
      });
      let errorMessage: string = text;
      try {
        // Try to parse JSON error message from upstream
        const parsed = JSON.parse(text);
        errorMessage = parsed.message || text;
      } catch {
        // Not JSON, use raw text as error message
      }
      
      // ERROR SANITIZATION STRATEGY:
      // In production (NODE_ENV=production), sanitize 5xx server errors to prevent
      // exposing internal implementation details (database errors, file paths, etc.)
      // to clients. 4xx client errors are passed through as they contain actionable
      // user-facing information (validation errors, permission issues, etc.).
      //
      // IMPORTANT: In development mode, all error messages are exposed to aid debugging.
      // This is intentional but means:
      // 1. NODE_ENV must be properly set in all environments
      // 2. Development builds should NEVER be deployed to production
      // 3. Use logging/monitoring tools for production troubleshooting, not error messages
      //
      // PRODUCTION SAFETY CHECKLIST:
      // - Verify NODE_ENV=production in production environments
      // - Use CI/CD to enforce production builds
      // - Monitor server logs for detailed error information
      // - Consider a separate DEBUG flag for controlled verbose logging if needed
      
      const is5xxError = res.status >= 500;
      // Only sanitize 5xx errors in production as they may expose internal implementation details
      const clientMessage = (IS_PRODUCTION && is5xxError)
        ? "An error occurred while processing your request" 
        : errorMessage;
      
      return NextResponse.json({ message: clientMessage, status: res.status }, { status: res.status });
    }

    return new NextResponse(text, { status: res.status, headers: { "content-type": contentType } });
  } catch (err) {
    const error = err as Error;
    
    // Check if circuit breaker is open using instanceof
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn("Circuit breaker is open - EzyGo API may be experiencing issues", { 
        path: pathSegments.join("/")
      });
      return NextResponse.json(
        { message: "Service temporarily unavailable - please try again shortly" }, 
        { status: 503 }
      );
    }
    
    // Check if this is an upstream server error (5xx or 429) - preserve response semantics
    if (error instanceof UpstreamServerError) {
      const is429 = error.status === 429;
      
      // Log 429 as warning, 5xx as error
      if (is429) {
        logger.warn("Proxy upstream rate limit (429)", { 
          status: error.status, 
          path: pathSegments.join("/"),
          bodyPreview: error.body.substring(0, MAX_ERROR_BODY_LOG_LENGTH)
        });
      } else {
        logger.error("Proxy upstream 5xx error", { 
          status: error.status, 
          path: pathSegments.join("/"),
          bodyPreview: error.body.substring(0, MAX_ERROR_BODY_LOG_LENGTH)
        });
      }
      
      let errorMessage: string = error.body;
      try {
        // Try to parse JSON error message from upstream
        const parsed = JSON.parse(error.body);
        errorMessage = parsed.message || error.body;
      } catch {
        // Not JSON, use raw text as error message
      }
      
      // Preserve 429 rate-limit messages even in production as they contain actionable info
      // Only sanitize 5xx errors which may expose internal implementation details
      const clientMessage = (IS_PRODUCTION && error.status >= 500)
        ? "An error occurred while processing your request" 
        : errorMessage;
      
      // For 429 responses, forward rate-limit headers to help clients back off correctly
      const responseHeaders: Record<string, string> = {};
      if (is429 && error.headers) {
        // Forward common rate-limit headers from upstream
        const headersToForward = [
          'retry-after',
          'x-ratelimit-limit',
          'x-ratelimit-remaining',
          'x-ratelimit-reset',
          'x-ratelimit-retry-after'
        ];
        
        for (const headerName of headersToForward) {
          const headerValue = error.headers.get(headerName);
          if (headerValue) {
            responseHeaders[headerName] = headerValue;
          }
        }
      }
      
      return NextResponse.json(
        { message: clientMessage, status: error.status }, 
        { status: error.status, headers: responseHeaders }
      );
    }
    
    // Check if response was too large
    if (error instanceof UpstreamResponseTooLargeError) {
      logger.error("Proxy response too large", { path: pathSegments.join("/"), error: error.message });
      return NextResponse.json(
        { message: "Upstream response too large" },
        { status: 502 }
      );
    }
    
    logger.error("Proxy fetch failed", { path: pathSegments.join("/"), error: error?.message });
    const isAbort = error?.name === "AbortError";
    return NextResponse.json({ message: isAbort ? "Upstream timed out" : "Upstream fetch failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "GET", path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "POST", path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "PUT", path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "PATCH", path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "DELETE", path);
}
// Export HEAD so Next.js forwards it to the upstream EzyGo API rather than
// auto-generating a response from GET (which would return no body but also incorrect
// upstream headers). forward() already handles HEAD correctly: isWrite=false (no CSRF
// check), hasBody=false (no body read or forwarded).
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, "HEAD", path);
}
