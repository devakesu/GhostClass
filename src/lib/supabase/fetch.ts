import { logger } from "@/lib/logger";

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

  if (callerSignal.aborted) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  return tierSignal;
}

/**
 * Resolves Supabase credentials based on environment.
 * Handles development overrides and validation guards.
 */
export function getSupabaseConfig(type: 'client' | 'admin' = 'client') {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (type === 'admin') {
      key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Use development overrides if present to ensure dev/prod isolation
  if (process.env.NODE_ENV === "development") {
    const devUrl = process.env.NEXT_PUBLIC_SUPABASE_DEV_URL;
    const devKey = type === 'admin' 
        ? process.env.SUPABASE_DEV_SECRET_KEY 
        : process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY;

    if (devUrl && devKey) {
      url = devUrl;
      key = devKey;
    } else if (url && url.includes('supabase.co')) {
      // Environment Guard: Alert developer if production URL is leaking into development
      // Use a delayed logger to avoid circular dependency issues if logger imports config
      setTimeout(() => {
        logger.warn(
          `[Supabase Security] Production URL detected in development! ⚠️`,
          `\nTarget: ${url}\nEnsure NEXT_PUBLIC_SUPABASE_DEV_URL and corresponding keys are configured.`
        );
      }, 0);
    }
  }

  return { url: url!, key: key! };
}

function getInputUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return (input as Request).url;
}

function stripTrailingSlashes(str: string): string {
  let s = str.trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

interface TierConfig {
  base: string;
  name: string;
}

function configureTierHeaders(
  input: RequestInfo | URL,
  initHeaders: HeadersInit | undefined,
  isDev: boolean,
  tierName: string,
): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (initHeaders) {
    new Headers(initHeaders).forEach((v, k) => headers.set(k, v));
  }

  if (isDev && tierName === "DevProxy") {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    if (appDomain) {
      headers.set("x-ghostclass-proxy-origin", `https://${appDomain}`);
    }
  }
  return headers;
}

function buildTierRequest(
  url: string,
  input: RequestInfo | URL,
  effectiveInit: RequestInit,
): { tierInput: RequestInfo | URL; tierInit: RequestInit } {
  if (typeof input === "string") {
    return { tierInput: url, tierInit: effectiveInit };
  }
  if (input instanceof URL) {
    return { tierInput: new URL(url), tierInit: effectiveInit };
  }
  const originalRequest = input as Request;
  return {
    tierInput: url,
    tierInit: {
      method: originalRequest.method,
      headers: originalRequest.headers,
      ...effectiveInit,
    },
  };
}

async function attemptTierFetch(
  tier: TierConfig,
  path: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  callerSignal: AbortSignal | null,
  bodyOverride: ArrayBuffer | null,
  isSafeMethod: boolean,
  isLast: boolean,
  isDev: boolean,
): Promise<{ success: true; response: Response } | { success: false; retryable: boolean; error?: unknown }> {
  const url = `${tier.base}${path}`;
  const tierController = new AbortController();
  const tierTimeout = setTimeout(() => tierController.abort(), SUPABASE_TIER_TIMEOUT_MS);
  const tierSignal: AbortSignal = combineSignals(callerSignal, tierController.signal);

  const headers = configureTierHeaders(input, init?.headers, isDev, tier.name);
  const effectiveInit: RequestInit = {
    ...init,
    headers,
    signal: tierSignal,
    ...(bodyOverride !== null ? { body: bodyOverride } : {}),
  };

  const { tierInput, tierInit } = buildTierRequest(url, input, effectiveInit);

  try {
    const res = await fetch(tierInput, tierInit);
    clearTimeout(tierTimeout);

    if (SUPABASE_RETRYABLE_STATUSES.has(res.status) && !isLast && isSafeMethod) {
      await res.body?.cancel();
      return { success: false, retryable: true };
    }
    return { success: true, response: res };
  } catch (err) {
    clearTimeout(tierTimeout);
    if (callerSignal?.aborted || isLast) {
      return { success: false, retryable: false, error: err };
    }
    return { success: false, retryable: true };
  }
}

async function extractBodyOverride(
  init: RequestInit | undefined,
  input: RequestInfo | URL,
): Promise<ArrayBuffer | null> {
  const rawBody = (init?.body as BodyInit | null | undefined) ?? (input instanceof Request && !input.bodyUsed ? input.body : null);
  if (rawBody instanceof ReadableStream) {
    try {
      return await new Response(rawBody).arrayBuffer();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Builds a tiered custom fetch function for Supabase requests.
 *
 * Tier order (only included when the corresponding env var is set):
 *   Tier 1 — CF Worker   (NEXT_PUBLIC_SUPABASE_CF_PROXY_URL)
 *   Tier 2 — AWS Lambda  (NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL)
 *   Tier 3 — Direct      (real supabase.co URL — always present)
 */
export function buildSupabaseTieredFetch(
  supabaseOrigin: string,
): typeof fetch | undefined {
  const parseProxyBase = (envVal: string | undefined): string | null => {
    const u = stripTrailingSlashes(envVal ?? "");
    if (!u) return null;
    try {
      const url = new URL(u);
      const basePath = url.pathname === "/" ? "" : stripTrailingSlashes(url.pathname);
      return `${url.origin}${basePath}`;
    } catch {
      return null;
    }
  };

  const isDev = process.env.NODE_ENV === "development";
  const devBase = isDev ? parseProxyBase(process.env.NEXT_PUBLIC_SUPABASE_DEV_PROXY_URL) : null;
  const cfBase  = parseProxyBase(process.env.NEXT_PUBLIC_SUPABASE_CF_PROXY_URL);
  const awsBase = parseProxyBase(process.env.NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL);

  const tiers: Array<TierConfig> = [];
  const isServer = typeof window === 'undefined';
  
  if (isServer) {
    // Server NEVER uses proxy (as per security policy)
    tiers.push({ base: supabaseOrigin, name: "direct" });
  } else if (isDev) {
    // Development: Only use DevProxy if explicitly configured
    if (devBase) tiers.push({ base: devBase, name: "DevProxy" });
    tiers.push({ base: supabaseOrigin, name: "direct" });
  } else {
    // Production: Use tiered failover (CF -> AWS -> direct)
    if (cfBase)  tiers.push({ base: cfBase, name: "CF" });
    if (awsBase) tiers.push({ base: awsBase, name: "AWS" });
    tiers.push({ base: supabaseOrigin, name: "direct" });
  }

  if (tiers.length === 1) return undefined;

  return async function tieredFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const inputUrl = getInputUrlString(input);
    let parsedInputUrl: URL;
    try {
      parsedInputUrl = new URL(inputUrl);
    } catch {
      return fetch(input, init);
    }

    if (parsedInputUrl.origin !== supabaseOrigin) {
      return fetch(input, init);
    }

    const path = `${parsedInputUrl.pathname}${parsedInputUrl.search}`;
    const callerSignal: AbortSignal | null = (init?.signal as AbortSignal | undefined) ?? (input instanceof Request ? input.signal : null);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isSafeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";

    let bodyOverride: ArrayBuffer | null = null;
    if (tiers.length > 1) {
      bodyOverride = await extractBodyOverride(init, input);
    }

    for (const [i, tier] of tiers.entries()) {
      const isLast = i === tiers.length - 1;
      const result = await attemptTierFetch(
        tier,
        path,
        input,
        init,
        callerSignal,
        bodyOverride,
        isSafeMethod,
        isLast,
        isDev,
      );

      if (result.success) {
        return result.response;
      }
      if (!result.retryable) {
        throw result.error;
      }
    }

    throw new Error("[supabase-proxy] unreachable: exhausted all tiers");
  };
}

// Module-level singleton
export const _supabaseOrigin = (() => {
  const { url } = getSupabaseConfig();
  try { 
    return new URL(url).origin; 
  } catch { 
    return url ?? ""; 
  }
})();

export const _customFetch = buildSupabaseTieredFetch(_supabaseOrigin);
