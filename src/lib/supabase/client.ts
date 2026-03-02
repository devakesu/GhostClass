import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Tiered Supabase fetch — mirrors server-side egressFetch for browser calls
// ---------------------------------------------------------------------------

// Retryable upstream statuses for browser → Supabase proxy failover.
// 4xx statuses (auth errors, validation failures) are NOT retried — they are
// valid Supabase responses that must be returned to the caller as-is.
// Only network-layer failures (errors + 5xx gateway codes) trigger failover.
const SUPABASE_RETRYABLE_STATUSES = new Set([502, 503, 504]);

// Per-tier fetch timeout. If a proxy tier does not respond within this window
// the next configured tier is tried. Kept short enough so failover completes
// well within typical auth operation budgets (~30 s).
const SUPABASE_TIER_TIMEOUT_MS = 10_000;

function combineSignals(
  callerSignal: AbortSignal | null,
  tierSignal: AbortSignal,
): AbortSignal {
  if (callerSignal === null) {
    return tierSignal;
  }

  const abortSignalAny = (AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;

  if (typeof abortSignalAny === "function") {
    return abortSignalAny([callerSignal, tierSignal]);
  }

  // Fallback for environments without AbortSignal.any.
  // Avoid attaching per-request listeners to prevent an event-listener leak.
  // If the caller has already aborted, immediately return an aborted signal.
  if (callerSignal.aborted) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  // Otherwise, rely solely on the tier-specific signal (e.g., timeout).
  // This means mid-flight caller aborts are not propagated in this fallback,
  // but we avoid leaking listeners on older browsers.
  return tierSignal;
}

/**
 * Builds a tiered custom fetch function for browser → Supabase requests.
 *
 * @internal Exported for unit testing only. Do not use directly in app code.
 *
 * Tier order (only included when the corresponding env var is set):
 *   Tier 1 — CF Worker   (NEXT_PUBLIC_SUPABASE_CF_PROXY_URL)
 *   Tier 2 — AWS Lambda  (NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL)
 *   Tier 3 — Direct      (real supabase.co URL — always present)
 *
 * The real Supabase URL is passed to `createBrowserClient` unchanged so the
 * client constructs correct API paths and auth headers. This wrapper intercepts
 * only requests to the Supabase origin and rewrites the origin for each tier.
 *
 * Returns `undefined` when no proxy is configured (zero overhead in normal mode).
 */
export function buildSupabaseTieredFetch(
  supabaseOrigin: string,
): typeof fetch | undefined {
  // Parses the proxy URL into a base string (origin + optional path prefix).
  // Preserves any path component so API Gateway stage prefixes (e.g. /prod)
  // survive when Supabase request paths are appended.
  // Trailing slashes are stripped to avoid "https://host//path" double-slashes.
  const parseProxyBase = (envVal: string | undefined): string | null => {
    const u = envVal?.trim().replace(/\/+$/, "");
    if (!u) return null;
    try {
      const url = new URL(u);
      // If the path is exactly "/", omit it so bare origins (CF Workers)
      // don't produce "https://host/" + "/auth/v1/…" → "https://host//auth/v1/…".
      const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
      return `${url.origin}${basePath}`;
    } catch {
      return null;
    }
  };

  const cfBase  = parseProxyBase(process.env.NEXT_PUBLIC_SUPABASE_CF_PROXY_URL);
  const awsBase = parseProxyBase(process.env.NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL);

  // No proxies configured — return undefined so createBrowserClient uses native fetch.
  if (!cfBase && !awsBase) return undefined;

  // Build ordered tier list; direct supabase.co is always the final fallback.
  const tiers: Array<{ base: string; name: string }> = [];
  if (cfBase)  tiers.push({ base: cfBase,         name: "CF" });
  if (awsBase) tiers.push({ base: awsBase,         name: "AWS" });
  tiers.push(    { base: supabaseOrigin,  name: "direct" });

  return async function tieredFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Resolve and parse the input URL regardless of input type.
    const inputUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    let parsedInputUrl: URL;
    try {
      parsedInputUrl = new URL(inputUrl);
    } catch {
      // If the request URL is malformed or relative, do not attempt proxying.
      return fetch(input, init);
    }

    // Pass through any request not aimed at the Supabase origin unchanged.
    if (parsedInputUrl.origin !== supabaseOrigin) {
      return fetch(input, init);
    }

    const path = `${parsedInputUrl.pathname}${parsedInputUrl.search}`;
    const callerSignal: AbortSignal | null =
      (init?.signal as AbortSignal | undefined) ??
      (input instanceof Request ? input.signal : null);

    // Determine the HTTP method so we can decide whether status-based failover
    // is safe. GET / HEAD / OPTIONS are idempotent and safe to retry on 5xx.
    // POST / PUT / PATCH / DELETE mutate state (auth tokens, sessions, rows) and
    // must NOT be retried on 5xx — the request may have already been processed
    // by Supabase before the gateway returned the error, and retrying would
    // corrupt auth state (double-logout, token double-consume, etc.).
    // We still failover mutations on network errors (thrown exceptions) because
    // those mean the request provably never reached Supabase.
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const isSafeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";

    // Pre-buffer ReadableStream bodies when there are multiple tiers.
    //
    // A Request body is a one-shot ReadableStream: once the first-tier fetch
    // internally consumes it (even if the connection is then dropped), every
    // subsequent tier receives an empty body.  For auth mutations like
    // POST /auth/v1/token (token refresh) an empty body causes Supabase to
    // return 400/401, which the Supabase JS client treats as "session expired"
    // and signs the user out — a spurious logout with no user action.
    //
    // Resolution: eagerly drain the stream into an ArrayBuffer before the loop.
    // String / ArrayBuffer / Blob / FormData / URLSearchParams bodies are
    // already value-typed and re-readable — only ReadableStream needs this.
    // The buffer is then injected into every tier's init so each attempt has
    // the full body regardless of what earlier tiers consumed.
    let bodyOverride: ArrayBuffer | null = null;
    if (tiers.length > 1) {
      const rawBody =
        (init?.body as BodyInit | null | undefined) ??
        (input instanceof Request && !input.bodyUsed ? input.body : null);
      if (rawBody instanceof ReadableStream) {
        try {
          bodyOverride = await new Response(rawBody).arrayBuffer();
        } catch {
          // Stream already consumed or empty — proceed without body override.
          // Supabase will return a 400 and the caller handles it normally.
          bodyOverride = null;
        }
      }
    }

    for (let i = 0; i < tiers.length; i++) {
      const tier   = tiers[i];
      const isLast = i === tiers.length - 1;
      const url    = `${tier.base}${path}`;

      const tierController = new AbortController();
      const tierTimeout    = setTimeout(
        () => tierController.abort(),
        SUPABASE_TIER_TIMEOUT_MS,
      );
      const tierSignal: AbortSignal = combineSignals(callerSignal, tierController.signal);

      // Rebuild the input with this tier's origin.
      // When a body has been pre-buffered (see above), inject it so each tier
      // receives the full body regardless of whether an earlier tier consumed
      // the original ReadableStream.
      const effectiveInit: RequestInit = {
        ...init,
        signal: tierSignal,
        ...(bodyOverride !== null ? { body: bodyOverride } : {}),
      };

      let tierInput: RequestInfo | URL;
      let tierInit: RequestInit = effectiveInit;

      if (typeof input === "string") {
        tierInput = url;
      } else if (input instanceof URL) {
        tierInput = new URL(url);
      } else {
        // When input is a Request, its method and headers live on the object
        // itself — they are not automatically copied into `init`. Spread them
        // first so effectiveInit (signal, buffered body override) wins on clash.
        const originalRequest = input as Request;
        const requestInitFromRequest: RequestInit = {
          method: originalRequest.method,
          headers: originalRequest.headers,
        };
        tierInput = url;
        tierInit = {
          ...requestInitFromRequest,
          ...effectiveInit,
        };
      }

      try {
        const res = await fetch(tierInput, tierInit);
        clearTimeout(tierTimeout);

        if (SUPABASE_RETRYABLE_STATUSES.has(res.status) && !isLast && isSafeMethod) {
          await res.body?.cancel();
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(tierTimeout);
        // If the caller's signal was aborted, propagate immediately regardless
        // of what the tier threw — failover won't help when the user cancelled.
        if (callerSignal?.aborted) {
          throw err;
        }
        if (isLast) throw err;
        continue;
      }
    }

    // Unreachable: the last iteration always returns or throws.
    throw new Error("[supabase-proxy] unreachable: exhausted all tiers");
  };
}

// ---------------------------------------------------------------------------
// Module-level singleton — NEXT_PUBLIC_* vars are build-time constants so the
// tiered fetch function never needs to be rebuilt between calls.
// Computed once when the module is first imported; zero cost on hot paths.
// ---------------------------------------------------------------------------
const _supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin; } catch { return process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""; }
})();
const _customFetch = buildSupabaseTieredFetch(_supabaseOrigin);

/**
 * Creates a Supabase browser client for client-side operations.
 * For use in Client Components and browser-side code.
 *
 * Features:
 * - Automatic session management in browser
 * - localStorage-based persistence
 * - Optimized for client-side React components
 *
 * ISP PROXY SUPPORT
 * -----------------
 * When `supabase.co` is blocked by ISPs, set one or both of:
 *   - `NEXT_PUBLIC_SUPABASE_CF_PROXY_URL`  — Cloudflare Worker (Tier 1, lowest latency)
 *   - `NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL` — AWS Lambda (Tier 2, fallback)
 *
 * The browser client automatically tries CF first, falls back to AWS on network
 * errors or 5xx, then falls back to direct supabase.co as a last resort.
 * Failover does NOT occur on 4xx responses (auth errors, bad requests) — those
 * are valid Supabase responses returned as-is.
 *
 * The Next.js server always contacts Supabase directly (server.ts / admin.ts).
 * When the ISP block is lifted, clear both proxy env vars and redeploy.
 *
 * @returns Configured Supabase browser client
 *
 * @example
 * ```tsx
 * "use client";
 *
 * const supabase = createClient();
 * const { data } = await supabase.from('users').select();
 * ```
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    _customFetch ? { global: { fetch: _customFetch } } : undefined,
  );
}