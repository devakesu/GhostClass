/**
 * AWS Lambda: EzyGo Egress Proxy
 *
 * Runtime  : Node.js 22.x  |  Architecture: arm64
 * Role     : Secondary / fallback egress for GhostClass → EzyGo API calls when the
 *            Cloudflare Worker (primary) is unavailable, rate-limited, or over quota.
 *
 * API Gateway setup
 * -----------------
 * • HTTP API (not REST API) — payload format v2.0
 * • Single route: ANY /{proxy+}  →  this Lambda
 * • Stage: $default, auto-deploy enabled
 * • Do NOT place Lambda in a VPC — naked Lambda uses AWS's broad shared egress pool
 *   (VPC + NAT Gateway collapses all traffic to a handful of fixed NAT IPs, defeating
 *   the purpose of IP diversity).
 *
 * Lambda environment variables (set in Configuration → Environment variables)
 * ---------------------------------------------------------------------------
 *   EZYGO_API_URL   Base URL of EzyGo API, e.g.:
 *                   "https://production.api.ezygo.app/api/v1/Xcr45_salt"
 *                   No trailing slash. Path prefix is allowed/expected when your
 *                   EzyGo deployment requires it (this project does).
 *   PROXY_SECRET    Same value as AWS_SECONDARY_SECRET in your Next.js server env.
 *                   Store this as an AWS Secrets Manager secret and inject via a Lambda
 *                   extension for better security (not required for initial setup).
 *
 * Security model
 * --------------
 * • Every incoming request must carry `x-proxy-secret` matching PROXY_SECRET.
 *   This secret is set server-side by Next.js and never exposed to the browser.
 * • All AWS / API-GW infrastructure headers are stripped before forwarding so
 *   EzyGo cannot fingerprint the AWS environment.
 * • Client IP headers (x-forwarded-for, x-real-ip) injected by the Next.js server
 *   are preserved so EzyGo continues to see the original browser IP (first priority).
 *
 * CLIENT IP PRIORITY
 * ------------------
 * Next.js extracts the real browser IP and injects it as `x-forwarded-for` /
 * `x-real-ip` before sending to this Lambda.  These headers are passed through
 * unchanged — EzyGo sees the real client IP regardless of the egress path.
 * If no IP was injected, EzyGo uses the Lambda outbound IP — still providing IP
 * diversity compared to the single fixed server VPS IP.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Strips all trailing slashes from a string without using regex backtracking.
 */
function stripTrailingSlashes(str) {
  let s = str.trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

const EZYGO_API_URL  = stripTrailingSlashes(process.env.EZYGO_API_URL  ?? "");
// Trim to guard against accidental whitespace in environment configuration.
const PROXY_SECRET   = (process.env.PROXY_SECRET   ?? "").trim();

// Pre-compute the HMAC key and expected digest once at module load.
// Both depend only on PROXY_SECRET, so there is no benefit in recomputing
// them per request.  The digest is used with timingSafeEqual inside the
// handler so the comparison always operates on fixed-length 32-byte buffers,
// avoiding timing side-channels based on value or length differences.
const AUTH_KEY             = PROXY_SECRET ? Buffer.from(PROXY_SECRET) : null;
const EXPECTED_AUTH_DIGEST = AUTH_KEY
  ? createHmac("sha256", AUTH_KEY).update(PROXY_SECRET).digest()
  : null;

// Headers injected by AWS / API Gateway that must not be forwarded to EzyGo.
const STRIP_REQUEST_HEADERS = new Set([
  "x-proxy-secret",       // Our auth header — must never reach EzyGo
  "x-forwarded-proto",    // AWS-injected
  "x-forwarded-port",     // AWS-injected
  "x-amzn-trace-id",      // AWS X-Ray trace ID
  "x-amzn-requestid",     // API GW request ID
  "x-amz-cf-id",          // CloudFront ID (if any)
  "x-amz-security-token", // Should never be present; strip defensively
  "via",                   // Hop-by-hop proxy trail
  "connection",            // HTTP/1.1 connection management
  // Request framing/encoding can become stale when API Gateway delivers
  // base64-decoded payloads to Lambda. Let undici compute these correctly.
  "content-length",
  "content-encoding",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Node.js fetch auto-decompresses the response body before response.text()
  // is called, so the body Lambda returns to API Gateway is already plain text.
  // Forwarding content-encoding: gzip would cause the client to try to
  // decompress again -> garbled JSON.
  // content-length is also stale after decompression, so strip it too.
  "content-encoding",
  "content-length",
]);

function authenticateRequest(eventHeaders) {
  const incomingSecret = (eventHeaders?.["x-proxy-secret"] ?? "").trim();
  const actualDigest   = AUTH_KEY ? createHmac("sha256", AUTH_KEY).update(incomingSecret).digest() : null;
  if (!PROXY_SECRET || !EXPECTED_AUTH_DIGEST || !actualDigest || !timingSafeEqual(EXPECTED_AUTH_DIGEST, actualDigest)) {
    return { statusCode: 403, body: "Forbidden" };
  }
  return null;
}

function buildTargetUrl(rawPath, rawQueryString) {
  if (!EZYGO_API_URL) {
    return { error: { statusCode: 500, body: "Misconfigured: EZYGO_API_URL is empty or only whitespace" } };
  }
  let upstreamBase;
  try {
    upstreamBase = new URL(EZYGO_API_URL);
  } catch {
    return { error: { statusCode: 500, body: "Misconfigured: EZYGO_API_URL is not a valid URL" } };
  }
  const basePath       = stripTrailingSlashes(upstreamBase.pathname);
  const incomingPath   = rawPath;

  // Path-join strategy (supports both caller styles):
  // 1) Caller sends /login/lookup                 + base /api/v1/X -> /api/v1/X/login/lookup
  // 2) Caller sends /api/v1/X/login/lookup        + base /api/v1/X -> /api/v1/X/login/lookup
  // This prevents dropping the required base path or double-prefixing it.
  let resolvedPathname = incomingPath;
  if (basePath) {
    const hasBasePrefix = incomingPath === basePath || incomingPath.startsWith(`${basePath}/`);
    if (!hasBasePrefix) {
      resolvedPathname = `${basePath}${incomingPath.startsWith("/") ? "" : "/"}${incomingPath}`;
    }
  }

  const target = new URL(upstreamBase.origin);
  target.pathname = resolvedPathname;
  target.search = rawQueryString;
  return { targetUrl: target.toString() };
}

async function prepareLambdaResponse(response) {
  // ── 6. Read response body ─────────────────────────────────────────────────
  // Use text() for text/JSON responses (all EzyGo API calls).
  // Use arrayBuffer() + base64 for binary content as a safety fallback
  // so the Lambda passthrough does not corrupt non-UTF-8 payloads.
  const responseContentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isTextResponse =
    responseContentType === "" ||
    responseContentType.startsWith("text/") ||
    responseContentType.startsWith("application/json") ||
    responseContentType.startsWith("application/xml");

  let responseBody;
  let isBase64Encoded;
  if (isTextResponse) {
    responseBody = await response.text();
    isBase64Encoded = false;
  } else {
    const buffer = await response.arrayBuffer();
    responseBody = Buffer.from(buffer).toString("base64");
    isBase64Encoded = true;
  }

  // ── 7. Filter and forward response headers ────────────────────────────────
  const responseHeaders = {};
  for (const [key, val] of response.headers.entries()) {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key.toLowerCase()] = val;
    }
  }

  return {
    statusCode: response.status,
    headers:    responseHeaders,
    body:       responseBody,
    isBase64Encoded,
  };
}

export const handler = async (event) => {
  // ── 1. Authenticate ───────────────────────────────────────────────────────
  // Both inputs are HMAC-SHA-256 digested with a key derived from PROXY_SECRET so
  // the comparison always operates on fixed-length 32-byte buffers, avoiding
  // timing side-channels based on value or length differences.
  const authError = authenticateRequest(event.headers);
  if (authError) {
    return authError;
  }

  // ── 2. Build target URL ───────────────────────────────────────────────────
  const rawPath        = event.rawPath        ?? "/";
  const rawQueryString = event.rawQueryString ?  `?${event.rawQueryString}` : "";
  const urlResult = buildTargetUrl(rawPath, rawQueryString);
  if (urlResult.error) {
    return urlResult.error;
  }
  const targetUrl = urlResult.targetUrl;

  // ── 3. Build outbound headers ─────────────────────────────────────────────
  const outHeaders = {};
  for (const [key, val] of Object.entries(event.headers ?? {})) {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      outHeaders[key.toLowerCase()] = val;
    }
  }
  // Ensure Host matches the EzyGo target for correct TLS SNI + virtual hosting.
  outHeaders["host"] = new URL(EZYGO_API_URL).hostname;

  // x-forwarded-for / x-real-ip: already set by Next.js to the real browser IP.
  // Leave them unchanged so EzyGo always sees the original client IP (first priority).

  // ── 4. Build request body ─────────────────────────────────────────────────
  // API Gateway HTTP API v2 sends binary bodies as base64-encoded strings.
  let body;
  if (event.body) {
    body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body;
  }

  const method = (event.requestContext?.http?.method ?? "GET").toUpperCase();

  // ── 5. Proxy to EzyGo ─────────────────────────────────────────────────────
  const response = await fetch(targetUrl, {
    method,
    headers: outHeaders,
    // Only attach body for methods that carry one to avoid runtime errors.
    ...(body ? { body, duplex: "half" } : {}),
    redirect: "follow",
  });

  return prepareLambdaResponse(response);
};
