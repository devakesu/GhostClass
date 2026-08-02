/**
 * Cloudflare Worker: EzyGo Egress Proxy
 *
 * PURPOSE
 * -------
 * Routes all GhostClass → EzyGo API requests through Cloudflare's global edge
 * network so EzyGo sees diverse CF egress IPs rather than the single server VPS
 * IP, naturally avoiding per-IP rate-limit blocks.
 *
 * SECURITY MODEL
 * --------------
 * • Requests are only forwarded when they carry the correct `x-proxy-secret`
 *   header (set server-side by Next.js; never exposed to the browser).
 * • The secret is stored as an encrypted Cloudflare Worker secret (not a plain
 *   environment variable) so it never appears in the dashboard in cleartext.
 * • All CF-internal request metadata headers are stripped before forwarding so
 *   EzyGo cannot fingerprint the Cloudflare infrastructure.
 *
 * CLIENT IP PRIORITY
 * ------------------
 * Next.js extracts the real browser IP (cf-connecting-ip → x-real-ip →
 * x-forwarded-for) and injects it into the outbound request as both
 * `x-forwarded-for` and `x-real-ip`.  This Worker preserves those headers
 * unchanged so EzyGo always sees the original client IP (first priority).
 * If no IP was injected by Next.js the CF worker's outbound IP is used as a
 * natural fallback (second priority) — still far better than the single fixed
 * server VPS IP.
 *
 * SETUP (Cloudflare Dashboard)
 * ----------------------------
 * 1. Workers & Pages → Create Application → Create Worker → name it "ezygo-proxy"
 * 2. Paste this file as the worker code and Deploy.
 * 3. Settings → Variables → Secrets:
 *      EZYGO_API_URL  – e.g. "https://production.api.ezygo.app/api/v1/Xcr45_salt"
 *      PROXY_SECRET   – same value as CF_PROXY_SECRET in your Next.js env; click Encrypt
 * 4. Set CF_PROXY_URL in your server/Next.js env to the Worker URL:
 *      https://ezygo-proxy.<your-cf-username>.workers.dev
 *    Leave NEXT_PUBLIC_BACKEND_URL pointing at the direct EzyGo API (tier 3 fallback) — do NOT change it.
 * 5. Set CF_PROXY_SECRET in your server/Next.js env to the same value as PROXY_SECRET above.
 */

/**
 * Constant-time HMAC-based comparison to prevent timing side-channel attacks.
 * Uses the Web Crypto API available in Cloudflare Workers.
 *
 * Each input is used as its own HMAC-SHA-256 key to sign the other input.
 * This produces fixed-length 32-byte digests regardless of the secret length,
 * so the byte loop always runs exactly 32 iterations.  The loop accumulates
 * differences with XOR/OR — it never short-circuits — so execution time is
 * independent of where (or whether) the values diverge.
 *
 * NOTE: The length check is intentionally omitted here. Different-length inputs
 * produce different HMAC-SHA-256 digests (the cross-signing means the digest
 * encodes the full byte sequence of each input), so the 32-iteration XOR loop
 * reliably returns non-zero for unequal inputs of any length — without leaking
 * the secret length through an early return.
 */
async function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const aKey = await crypto.subtle.importKey(
    "raw",
    aBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bKey = await crypto.subtle.importKey(
    "raw",
    bBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const aSig = await crypto.subtle.sign("HMAC", aKey, bBytes);
  const bSig = await crypto.subtle.sign("HMAC", bKey, aBytes);
  const aView = new Uint8Array(aSig);
  const bView = new Uint8Array(bSig);
  // XOR accumulates all byte differences without short-circuiting.
  // diff === 0 iff every byte pair is identical.
  let diff = 0;
  for (let i = 0; i < aView.length; i++) {
    diff |= aView.at(i) ^ bView.at(i);
  }
  return diff === 0;
}

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
    // ── 1. Authentication ─────────────────────────────────────────────────────
    // Only the GhostClass Next.js server knows this secret; browsers never see it.
    if (!env.PROXY_SECRET) {
      return new Response("Misconfigured: PROXY_SECRET is not set", {
        status: 500,
      });
    }
    const incomingSecret = request.headers.get("x-proxy-secret");
    if (
      !incomingSecret ||
      !(await constantTimeEqual(incomingSecret, env.PROXY_SECRET))
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    // ── 2. Build target URL ───────────────────────────────────────────────────
    const url = new URL(request.url);
    // env.EZYGO_API_URL should be the EzyGo base URL (path prefix allowed), e.g.
    // "https://production.api.ezygo.app/api/v1/Xcr45_salt".
    // No trailing slash.
    const rawBase = (env.EZYGO_API_URL || "").trim();
    if (!rawBase) {
      return new Response(
        "Misconfigured: EZYGO_API_URL is empty or only whitespace",
        { status: 500 },
      );
    }
    let upstreamBase;
    try {
      upstreamBase = new URL(rawBase);
    } catch {
      return new Response("Misconfigured: EZYGO_API_URL is not a valid URL", {
        status: 500,
      });
    }
    const basePath = stripTrailingSlashes(upstreamBase.pathname);
    const incomingPath = url.pathname;

    // Path-join strategy (supports both caller styles):
    // 1) Caller sends /login/lookup                 + base /api/v1/X -> /api/v1/X/login/lookup
    // 2) Caller sends /api/v1/X/login/lookup        + base /api/v1/X -> /api/v1/X/login/lookup
    // This prevents dropping the required base path or double-prefixing it.
    let resolvedPathname = incomingPath;
    if (basePath) {
      const hasBasePrefix = incomingPath === basePath ||
        incomingPath.startsWith(`${basePath}/`);
      if (!hasBasePrefix) {
        resolvedPathname = `${basePath}${
          incomingPath.startsWith("/") ? "" : "/"
        }${incomingPath}`;
      }
    }

    const targetUrl = new URL(upstreamBase.origin);
    targetUrl.pathname = resolvedPathname;
    targetUrl.search = url.search;

    // ── 3. Build outbound headers ─────────────────────────────────────────────
    const outHeaders = new Headers(request.headers);

    // Remove the proxy authentication secret — must never reach EzyGo.
    outHeaders.delete("x-proxy-secret");

    // Update Host to match the target so TLS SNI and virtual hosting work.
    outHeaders.set("host", targetUrl.hostname);

    // Strip Cloudflare-injected infrastructure headers.
    // These reveal that the request passed through Cloudflare and expose
    // metadata (ray IDs, connecting IP of the server VPS, etc.) that EzyGo
    // should not see.
    outHeaders.delete("cf-connecting-ip"); // Server VPS IP — hide from EzyGo
    outHeaders.delete("cf-ipcountry");
    outHeaders.delete("cf-ray");
    outHeaders.delete("cf-visitor");
    outHeaders.delete("cf-ew-via");
    outHeaders.delete("cdn-loop");

    // ── CLIENT IP HEADERS: PRESERVE, DO NOT OVERRIDE ─────────────────────────
    // Next.js already extracted the real browser IP and forwarded it as
    // `x-forwarded-for` / `x-real-ip`.  We intentionally leave those headers
    // untouched so EzyGo sees the original client IP (first priority).
    // If Next.js found no client IP these headers simply won't be present and
    // EzyGo will fall back to treating the CF worker's outbound IP as the
    // source — providing natural IP diversity (second priority).

    // ── 4. Forward the request ────────────────────────────────────────────────
    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: outHeaders,
      // Only attach a body for methods that carry one; passing body=null for
      // GET/HEAD avoids a "GET + body" error in some runtime environments.
      ...(request.body ? { body: request.body, duplex: "half" } : {}),
      redirect: "follow",
    });

    return fetch(proxyRequest);
  },
};
