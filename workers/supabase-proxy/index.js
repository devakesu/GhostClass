/**
 * Cloudflare Worker: Supabase Browser Proxy
 *
 * PURPOSE
 * -------
 * When supabase.co is blocked by ISPs (or any regional DNS/routing failure),
 * this worker acts as a transparent passthrough so browser clients can still
 * reach the Supabase API through Cloudflare's edge network.
 *
 * ARCHITECTURE
 * ------------
 * Browser  ──►  CF Worker (this file)  ──►  <project>.supabase.co
 *
 * The Next.js *server* still talks directly to Supabase (no extra hop) because
 * server-to-Supabase is unaffected by the ISP block.  Only the browser
 * Supabase JS client (`src/lib/supabase/client.ts`) is redirected here via
 * `NEXT_PUBLIC_SUPABASE_CF_PROXY_URL` (and optionally `NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL`).
 *
 * SECURITY MODEL
 * --------------
 * • Unlike the ezygo-proxy, requests arrive directly from the browser —
 *   a server-side shared secret is not applicable.
 * • Instead, ALLOWED_ORIGIN restricts which websites may use this proxy:
 *   preflight and cross-origin requests from other domains are rejected with
 *   403, and requests with no Origin header are also rejected with 403.
 * • Supabase's own authentication (anon key + Row Level Security) controls
 *   all data access — the proxy is truly transparent and adds no permissions.
 * • CF infra headers (cf-connecting-ip, cf-ray, etc.) are stripped so
 *   Supabase cannot fingerprint the CF environment.
 *
 * CORS
 * ----
 * Supabase responds with `Access-Control-Allow-Origin: <your-domain>` based
 * on its own CORS settings.  We pass those response headers through unchanged.
 * For preflight (OPTIONS) requests we only check the Origin and forward the
 * request upstream — Supabase's own preflight response is returned as-is.
 *
 * SETUP (Cloudflare Dashboard)
 * ----------------------------
 * 1. Workers & Pages → Create Application → Create Worker → name it "ghostclass-supabase-proxy"
 * 2. Paste this file as the worker code and Deploy.
 * 3. Settings → Variables → Secrets (click Encrypt for each):
 *      SUPABASE_URL    – your real Supabase project URL, e.g.
 *                        "https://abcdefghijklmnop.supabase.co"
 *                        No trailing slash. Do NOT include a path.
 *      ALLOWED_ORIGIN  – your app's public origin, e.g.
 *                        "https://yourapp.com"
 *                        Without trailing slash. One origin only.
 * 4. In your Next.js env (baked at build-time via NEXT_PUBLIC_*):
 *      NEXT_PUBLIC_SUPABASE_CF_PROXY_URL=https://ghostclass-supabase-proxy.<your-cf-username>.workers.dev
 *    Optionally also set NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL for a Tier 2 AWS fallback.
 *    Keep NEXT_PUBLIC_SUPABASE_URL pointing at the real Supabase URL — it is
 *    still used server-side and for Next.js Image Optimization.
 * 5. Redeploy your Next.js app.  When the ISP block is lifted, unset
 *    NEXT_PUBLIC_SUPABASE_CF_PROXY_URL (and NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL)
 *    to restore direct browser connections.
 *
 * MONITORING
 * ----------
 * Check Workers → Analytics → Requests for usage and errors.
 * Free tier: 100,000 requests/day.  An auth-only app is well within this.
 */

// CF infra headers that must never be forwarded to Supabase.
const STRIP_REQUEST_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cdn-loop",
  "connection",
  "keep-alive",
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

export default {
  async fetch(request, env) {
    // ── 1. Config validation ──────────────────────────────────────────────────
    const rawSupabaseUrl = stripTrailingSlashes(env.SUPABASE_URL ?? "");
    if (!rawSupabaseUrl) {
      return new Response("Misconfigured: SUPABASE_URL is not set", { status: 500 });
    }

    let supabaseOrigin;
    try {
      supabaseOrigin = new URL(rawSupabaseUrl).origin;
    } catch {
      return new Response("Misconfigured: SUPABASE_URL is not a valid URL", { status: 500 });
    }

    const allowedOrigin = stripTrailingSlashes(env.ALLOWED_ORIGIN ?? "");

    const requestOrigin = request.headers.get("origin");

    // ── 2. Origin check ───────────────────────────────────────────────────────
    // Reject requests arriving from a different website to prevent quota abuse.
    // When ALLOWED_ORIGIN is configured, all requests must include an Origin
    // header that exactly matches the allowed origin.
    if (!allowedOrigin) {
      return new Response("Misconfigured: ALLOWED_ORIGIN is not set", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Bypass Origin check for GET/HEAD requests to public storage.
    // Next.js server-side Image Optimization and mobile clients do not send an Origin header.
    const incomingPathname = new URL(request.url).pathname;
    const isPublicStorageGet =
      (request.method === "GET" || request.method === "HEAD") &&
      incomingPathname.startsWith("/storage/v1/object/public/");

    if (!requestOrigin) {
      if (!isPublicStorageGet) {
        return new Response("Forbidden: missing Origin header", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        });
      }
    } else {
      // Normalise both sides before comparing.
      const normReq = stripTrailingSlashes(requestOrigin);
      const normAllowed = allowedOrigin;
      if (normReq !== normAllowed) {
        return new Response("Forbidden: origin not allowed", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }
    // Keep the incoming path + query; only replace the origin.
    const incomingUrl = new URL(request.url);
    // Use the URL object's pathname property to prevent protocol-relative hijacking (//path).
    const targetUrl = new URL(supabaseOrigin);
    targetUrl.pathname = incomingUrl.pathname.replace(/\/+/g, "/");
    targetUrl.search = incomingUrl.search;

    // ── 4. Build outbound request headers ────────────────────────────────────
    const outHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
        outHeaders.set(key, value);
      }
    }
    // Correct the Host header for TLS SNI and virtual hosting.
    outHeaders.set("host", new URL(supabaseOrigin).hostname);

    // ── 5. Forward to Supabase ────────────────────────────────────────────────
    let supabaseResponse;
    try {
      supabaseResponse = await fetch(
        new Request(targetUrl.toString(), {
          method: request.method,
          headers: outHeaders,
          ...(request.body ? { body: request.body, duplex: "half" } : {}),
          redirect: "follow",
        }),
      );
    } catch (err) {
      return new Response(`Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`, {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ── 6. Build response — strip hop-by-hop headers ──────────────────────────
    const respHeaders = new Headers();
    for (const [key, value] of supabaseResponse.headers.entries()) {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    }

    return new Response(supabaseResponse.body, {
      status: supabaseResponse.status,
      statusText: supabaseResponse.statusText,
      headers: respHeaders,
    });
  },
};
