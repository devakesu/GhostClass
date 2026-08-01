/**
 * AWS Lambda: Supabase Browser Proxy
 *
 * Runtime  : Node.js 22.x  |  Architecture: arm64
 * Role     : Fallback inbound proxy for browser → Supabase traffic when the
 *            Cloudflare Worker (primary) is unavailable, or as the sole proxy
 *            when a CF Worker has not been deployed.
 *
 * API Gateway setup
 * -----------------
 * • HTTP API (not REST API) — payload format v2.0
 * • Single route: ANY /{proxy+}  →  this Lambda
 * • Stage: $default, auto-deploy enabled
 * • Do NOT place Lambda in a VPC — use naked Lambda (shared AWS egress pool).
 *
 * Why this exists
 * ---------------
 * When supabase.co is blocked by ISPs, browser clients cannot connect directly.
 * This Lambda acts as a transparent passthrough:
 *
 *   Browser  ──►  API Gateway / Lambda (this file)  ──►  <project>.supabase.co
 *
 * The Next.js *server* still talks to Supabase directly (no extra hop) because
 * server-side routing is unaffected by ISP blocks on the client side.
 *
 * Architecture note — CF vs AWS
 * ------------------------------
 * Unlike the EzyGo egress proxies (which are called server-side and use a
 * shared `x-proxy-secret`), Supabase proxies are called directly by the
 * browser (the Supabase JS client).  The security model therefore uses
 * Origin header checking instead of a shared secret — Supabase's own auth
 * (anon key + Row Level Security) controls all data access.
 *
 * Tier priority (operator-controlled via NEXT_PUBLIC_SUPABASE_CF_PROXY_URL
 * and NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL):
 *   Tier 1  — CF Worker (lower latency, global PoPs, 100k req/day free)
 *             NEXT_PUBLIC_SUPABASE_CF_PROXY_URL (browser-facing)
 *   Tier 2  — This Lambda (higher req limits, independent infra)
 *             NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL (browser-facing)
 * The browser uses whichever proxy URL(s) are baked at build-time; switching
 * tiers or changing endpoints requires updating those NEXT_PUBLIC_* vars and
 * redeploying the Next.js app.
 *
 * Lambda environment variables (Configuration → Environment variables)
 * --------------------------------------------------------------------
 *   SUPABASE_URL    Real Supabase project URL, e.g.
 *                   "https://abcdefghijklmnop.supabase.co"
 *                   No trailing slash, no path.
 *   ALLOWED_ORIGIN  Your app's public origin, e.g. "https://yourapp.com"
 *                   No trailing slash. One value only.
 *
 * Security model
 * --------------
 * • Browser requests arriving from a different domain are rejected with 403.
 * • Requests with no Origin header are rejected with 403 (browser-facing proxy only).
 * • All AWS / API-GW infrastructure headers are stripped before forwarding.
 * • Supabase's own authentication (anon key + RLS) governs data access.
 */

// Headers injected by AWS / API Gateway that must not reach Supabase.
const STRIP_REQUEST_HEADERS = new Set([
  "x-forwarded-proto", // AWS-injected
  "x-forwarded-port", // AWS-injected
  "x-amzn-trace-id", // AWS X-Ray trace ID
  "x-amzn-requestid", // API GW request ID
  "x-amz-cf-id", // CloudFront ID (if any)
  "x-amz-security-token", // Defensive strip
  "via", // Hop-by-hop proxy trail
  "connection", // HTTP/1.1 connection management
  // Request framing/encoding can become stale when API Gateway delivers
  // base64-decoded payloads to Lambda. Let undici compute these correctly.
  "content-length",
  "content-encoding",
]);

// Hop-by-hop response headers that must not be forwarded to the browser.
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
  // Forwarding content-encoding: gzip would cause the browser to try to
  // decompress again → garbled JSON → Supabase JS client sees no session → logout.
  // content-length is also stale after decompression, so strip it too.
  "content-encoding",
  "content-length",
]);

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

const SUPABASE_URL = stripTrailingSlashes(process.env.SUPABASE_URL ?? "");
const ALLOWED_ORIGIN = stripTrailingSlashes(process.env.ALLOWED_ORIGIN ?? "");

function validateOrigin(eventHeaders, method, path) {
  const requestOrigin = stripTrailingSlashes(eventHeaders?.["origin"] ?? "");
  const isPublicStorageGet = (method === "GET" || method === "HEAD") &&
    path.startsWith("/storage/v1/object/public/");

  if (!requestOrigin) {
    if (!isPublicStorageGet) {
      return { statusCode: 403, body: "Forbidden: Origin header is required" };
    }
    return null;
  }
  if (!ALLOWED_ORIGIN) {
    return {
      statusCode: 500,
      body: "Misconfigured: ALLOWED_ORIGIN is not set",
    };
  }
  if (requestOrigin !== ALLOWED_ORIGIN) {
    return { statusCode: 403, body: "Forbidden: origin not allowed" };
  }
  return null;
}

async function prepareLambdaResponse(response) {
  // ── 7. Read response body ─────────────────────────────────────────────────
  // Use text() for text/JSON responses (all Supabase Auth and PostgREST calls).
  // Use arrayBuffer() + base64 for binary content (e.g. Supabase Storage downloads)
  // so the Lambda passthrough does not corrupt non-UTF-8 payloads.
  const responseContentType = (response.headers.get("content-type") ?? "")
    .toLowerCase();
  // Default to text when content-type is absent — Supabase Auth and PostgREST
  // always send a content-type header; a missing header means an unexpected
  // response where text() is the safest fallback for logging/debugging.
  const isTextResponse = responseContentType === "" ||
    responseContentType.startsWith("text/") ||
    responseContentType.startsWith("application/json") ||
    responseContentType.startsWith("application/vnd.pgrst.") ||
    responseContentType.startsWith("application/x-www-form-urlencoded") ||
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

  // ── 8. Filter and forward response headers ────────────────────────────────
  const responseHeaders = {};
  for (const [key, value] of response.headers.entries()) {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key.toLowerCase()] = value;
    }
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: responseBody,
    isBase64Encoded,
  };
}

export const handler = async (event) => {
  // ── 1. Config validation ──────────────────────────────────────────────────
  if (!SUPABASE_URL) {
    return { statusCode: 500, body: "Misconfigured: SUPABASE_URL is not set" };
  }
  let supabaseOrigin;
  try {
    supabaseOrigin = new URL(SUPABASE_URL).origin;
  } catch {
    return {
      statusCode: 500,
      body: "Misconfigured: SUPABASE_URL is not a valid URL",
    };
  }

  const rawPath = event.rawPath ?? "/";
  const method = (event.requestContext?.http?.method ?? "GET").toUpperCase();

  // ── 2. Origin check ───────────────────────────────────────────────────────
  // All requests must supply an Origin header that exactly matches ALLOWED_ORIGIN.
  // Allowing origin-less requests would make this an open proxy to your Supabase
  // project — anyone with curl/Postman could relay arbitrary traffic at your cost.
  const originError = validateOrigin(event.headers, method, rawPath);
  if (originError) {
    return originError;
  }

  // ── 3. Build target URL ───────────────────────────────────────────────────
  // Preserve the incoming path + query; only swap the origin.
  const rawQueryString = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const targetUrl = `${supabaseOrigin}${rawPath}${rawQueryString}`;

  // ── 4. Build outbound headers ─────────────────────────────────────────────
  const outHeaders = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      outHeaders[key.toLowerCase()] = value;
    }
  }
  // Correct Host so Supabase's TLS SNI and virtual hosting work correctly.
  outHeaders["host"] = new URL(supabaseOrigin).hostname;

  // ── 5. Build request body ─────────────────────────────────────────────────
  // API Gateway HTTP API v2 sends binary bodies as base64-encoded strings.
  let body;
  if (event.body) {
    body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body;
  }

  // ── 6. Proxy to Supabase ──────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: outHeaders,
      ...(body ? { body, duplex: "half" } : {}),
      redirect: "follow",
    });
  } catch (err) {
    return {
      statusCode: 502,
      body: `Proxy fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return prepareLambdaResponse(response);
};
