// Content Security Policy
//
// NEXT.JS INLINE SCRIPT HANDLING:
// Next.js App Router generates inline scripts for hydration and client-side navigation.
// The root layout reads the per-request nonce from the x-nonce header (set by middleware)
// so that Next.js's rendering pipeline can apply it to its own inline bootstrap scripts.
//
// CLOUDFLARE ZARAZ CSP INTEGRATION:
// Cloudflare Zaraz can inject inline scripts for analytics and tracking.
// Zaraz scripts that carry the per-request nonce attribute are permitted by the nonce directive.
//
// SECURITY POSTURE:
// - script-src:      Uses nonce + 'strict-dynamic' for dynamically loaded external scripts (strict)
// - script-src-elem: Uses nonce (CSP3) / 'unsafe-inline' CSP2-fallback for inline scripts
// - External scripts: Restricted to explicitly whitelisted hosts only
// - This maintains strong XSS protection while allowing Next.js and Cloudflare to function
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseConfig } from "@/lib/supabase/fetch";

export const getCspHeader = (nonce?: string) => {
  // FORCE_STRICT_CSP / NEXT_PUBLIC_FORCE_STRICT_CSP
  // ------------------------------------------------
  // By default, we relax CSP in development to make Next.js and tooling easier to work with.
  // Setting FORCE_STRICT_CSP=true (or 1 / yes) in the environment forces production-like,
  // strict CSP behavior even when NODE_ENV !== "production". This is useful for:
  //   - Testing strict CSP locally
  //   - Reproducing production-only CSP issues in development
  //
  // For client-side access (e.g. when reading from process.env.NEXT_PUBLIC_* in the browser),
  // the same behavior can be enabled with NEXT_PUBLIC_FORCE_STRICT_CSP=true.
  //
  // The isDev flag below intentionally treats "forced strict CSP" as non-development,
  // so that all CSP decisions match production behavior whenever forceStrictCsp is enabled.
  const forceStrictCspValue = process.env.FORCE_STRICT_CSP ?? process.env.NEXT_PUBLIC_FORCE_STRICT_CSP;
  const forceStrictCsp = /^(true|1|yes)$/i.test(forceStrictCspValue ?? "");
  const isActualProduction = process.env.NODE_ENV === "production";
  const isDev = !isActualProduction && !forceStrictCsp;
  const supabaseOrigin = (() => {
    const { url: urlString } = getSupabaseConfig("client");

    if (!urlString) return "";
    try {
      return new URL(urlString).origin;
    } catch {
      return "";
    }
  })();

  // When Supabase browser proxies are configured (ISP block workaround), browsers
  // connect through CF Worker (Tier 1) or AWS Lambda (Tier 2) instead of supabase.co.
  // Both proxy origins are kept in connect-src alongside the real Supabase origin so
  // that the tiered fetch wrapper can reach whichever tier is active.
  const parseProxyOrigin = (envVar: string | undefined): string => {
    if (!envVar) return "";
    try { return new URL(envVar).origin; } catch { return ""; }
  };
  const supabaseCfProxyOrigin  = parseProxyOrigin(process.env.NEXT_PUBLIC_SUPABASE_CF_PROXY_URL);
  const supabaseAwsProxyOrigin = parseProxyOrigin(process.env.NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL);
  const supabaseDevProxyOrigin = parseProxyOrigin(process.env.NEXT_PUBLIC_SUPABASE_DEV_PROXY_URL);
  
  // Supabase WebSocket URL for Realtime features
  const supabaseWsUrl = (() => {
    const { url: urlString } = getSupabaseConfig("client");

    if (!urlString) return "";

    try {
      const url = new URL(urlString);
      if (url.protocol === "https:") {
        url.protocol = "wss:";
      } else if (url.protocol === "http:") {
        url.protocol = "ws:";
      }
      // Use .origin (protocol + host + port only) — .toString() would include any
      // path/query present in the env var, which browsers would not match as a
      // connect-src WebSocket origin.
      return url.origin;
    } catch {
      return "";
    }
  })();

  // In production, nonce is mandatory for strict CSP enforcement
  // FAIL CLOSED: Do not serve degraded CSP — this is a critical security failure
  if (!isDev && !nonce) {
    logger.error(
      '[CSP] CRITICAL: Nonce is required in production for secure CSP enforcement. ' +
      'Refusing to serve page without nonce (fail-closed security posture). ' +
      'Investigate and fix immediately: ' +
      '1. Verify middleware is generating nonce (check src/proxy.ts nonce generation) ' +
      '2. Ensure middleware is passing nonce via x-nonce header to downstream components ' +
      '3. Check that getCspHeader is called with the nonce parameter from headers ' +
      '4. Confirm middleware matcher includes the current route (see matcher config in src/proxy.ts) ' +
      '5. Verify environment variable NODE_ENV is set to "production" for this deployment'
    );

    // Alert Sentry with fatal severity to page operators immediately
    Sentry.captureException(
      new Error('[CSP] FATAL: Nonce missing in production — refusing to serve degraded CSP'),
      { level: 'fatal', tags: { type: 'csp_missing_nonce', location: 'getCspHeader', severity: 'fail_closed' } }
    );
    
    // Return hardened error CSP that blocks everything except basic structure
    // This ensures the page cannot execute any scripts and displays an error
    return `
      default-src 'none';
      script-src 'none';
      style-src 'self';
      img-src 'self';
      font-src 'self';
      base-uri 'none';
      form-action 'none';
      frame-ancestors 'none';
      report-to csp-endpoint;
      report-uri /api/csp-report;
    `.replace(/\s{2,}/g, ' ').trim();
  }

  const scriptSrcParts = isDev
    ? [
        "'self'",
        "blob:",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://challenges.cloudflare.com",
        "https://static.cloudflareinsights.com",
      ]
    : [
        "'self'",
        "blob:",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        // 'unsafe-inline' is ignored by browsers that support nonces (CSP3).
        // It acts purely as a backward-compatibility fallback for CSP2-only browsers.
        // Lighthouse requires it here to not flag script-src as incomplete.
        "'unsafe-inline'",
        // When FORCE_STRICT_CSP is set in a non-production environment (e.g. to test
        // strict CSP locally), React Fast Refresh (HMR) is still active and requires
        // 'unsafe-eval'. We include it here so the dev server is not broken.
        // In a real production build, NODE_ENV === 'production' so this is never emitted.
        ...(!isActualProduction ? ["'unsafe-eval'"] : []),
        // Note: With 'strict-dynamic', explicitly listed host sources below are ignored
        // by modern browsers (CSP Level 3) and only apply to older browsers as fallback.
        // For modern browsers, external scripts must be loaded dynamically by nonce'd scripts.
        "https://challenges.cloudflare.com",
        "https://static.cloudflareinsights.com",
      ];

  // Use granular style directives for better XSS protection
  // style-src-elem: Controls <style> elements and <link> with rel="stylesheet"
  // We allow nonce'd styles plus specific hashes for library-injected CSS
  // 
  // CSP Style Hash Whitelist:
  // Each hash whitelists a specific inline <style> block. If any of these libraries update,
  // the corresponding hash must be recalculated. To calculate a new hash:
  // 1. Extract the CSS content from browser DevTools console error
  // 2. Run: echo -n "CSS_CONTENT" | openssl dgst -sha256 -binary | openssl base64 -A
  // 3. Add as 'sha256-BASE64_HASH'
  //
  // Current hashes:
  // - 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=' 
  //   → Sonner v2.0.7 toast library CSS injected via __insertCSS() 
  //   → See node_modules/sonner/dist/index.js
  //   → Contains toast animations, positioning, and styling (~7KB minified)
  //
  // - 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 
  //   → Empty string hash (SHA-256 of "")
  //   → Some libraries inject empty <style> tags as placeholders
  //   → Required for React components that dynamically create style elements
  //
  // - 'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk=' 
  //   → Recharts library inline styles for chart rendering
  //   → Used for SVG chart styling and animations
  //
  // - 'sha256-AMd96FJ0GSrxFtEVT53SsztnJlpK57ZkVSOwhrM6Jjg=' 
  //   → Next.js or React hydration inline styles
  //   → Used during client-side hydration to prevent FOUC
  //
  // - 'sha256-DnU2FixQA4mFSjGuLz5b9dJ5ARj46/zX6IW2U4X4iIs=' 
  //   → Additional library inline styles (possibly Framer Motion or shadcn/ui)
  //   → Used for animation transitions and component styling
  //
  // - 'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='
  //   → Login page or authentication component inline styles
  //   → Used for form animations or transitions
  //
  // - 'sha256-Q9MUdYBtYzn5frLpoNRLdFYW76cJ4ok2SmIKzTFq57Q='
  //   → Inline styles injected at runtime (observed in production CSP violation)
  //
  // - 'sha256-wiog7aClo6fLAZmHb/tPNxWHoZlb/gI0ju+YaSxXMrI='
  //   → Inline styles injected at runtime (observed in production CSP violation)
  // IMPORTANT: 'unsafe-inline' is silently ignored by CSP3 browsers when a nonce or hash is
  // also present in the directive. Therefore, mixing nonce + 'unsafe-inline' does NOT work.
  // For non-production environments (including FORCE_STRICT_CSP dev mode), Next.js dev tooling
  // (error overlay, devtool-style-inject.js) injects dynamic <style> blocks that change every
  // build — making hashing impractical. We skip the nonce branch entirely for style directives
  // outside real production and fall back to the simple 'unsafe-inline' path.
  const styleSrcElemParts = !isActualProduction
    ? ["'self'", "'unsafe-inline'"]
    : [
        "'self'", 
        `'nonce-${nonce}'`, 
        "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='", // Sonner toast CSS
        "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // Empty string
        "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='", // Recharts
        "'sha256-AMd96FJ0GSrxFtEVT53SsztnJlpK57ZkVSOwhrM6Jjg='", // Next.js/React hydration
        "'sha256-DnU2FixQA4mFSjGuLz5b9dJ5ARj46/zX6IW2U4X4iIs='", // Animation libraries
        "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='", // Login/auth inline styles
        "'sha256-Q9MUdYBtYzn5frLpoNRLdFYW76cJ4ok2SmIKzTFq57Q='", // Runtime inline styles
        "'sha256-wiog7aClo6fLAZmHb/tPNxWHoZlb/gI0ju+YaSxXMrI='"  // Runtime inline styles
      ];
  
  // script-src-elem: Controls <script> elements specifically
  // Separate from script-src, which uses nonce + 'strict-dynamic' for dynamically loaded scripts
  // Here we intentionally avoid 'strict-dynamic' and instead rely on explicit host allowlisting
  // so that third-party scripts from Cloudflare can load.
  //
  // In production we use the same nonce + 'unsafe-inline' pattern as script-src:
  //   - CSP Level 3 browsers: nonce is enforced; 'unsafe-inline' is silently ignored because
  //     a nonce is present in the directive. Only scripts whose nonce attribute matches the
  //     per-request nonce are allowed to execute, providing full XSS protection.
  //   - CSP Level 2 browsers: 'unsafe-inline' acts as a backward-compatibility fallback.
  // NOTE: The nonce is not forwarded to any <Script> component in the root layout. In CSP Level 3
  // browsers this means such inline bootstrap scripts will *not* run unless they are moved to a
  // location where Next.js applies the nonce or refactored into external files. In older CSP Level 2
  // user agents, 'unsafe-inline' still acts as a fallback for those non-nonced inline scripts.
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  const scriptSrcElemParts = isDev
    ? ["'self'", "'unsafe-inline'"]
    : (() => {
        const parts = [
          "'self'",
          `'nonce-${nonce}'`,
          // 'unsafe-inline' is ignored by CSP3 browsers when a nonce is present.
          // It remains here only as a CSP Level 2 backward-compatibility fallback,
          // matching the same pattern used in script-src above.
          "'unsafe-inline'",
          "https://challenges.cloudflare.com",
          "https://static.cloudflareinsights.com",
        ];

        if (appDomain) {
          parts.push(`https://${appDomain}/cdn-cgi/`); // Cloudflare CDN scripts
        } else {
          logger.warn(
            "[CSP] NEXT_PUBLIC_APP_DOMAIN is not set; skipping Cloudflare /cdn-cgi/ script allowlist entry in script-src-elem."
          );
        }

        return parts.filter(Boolean) as string[];
      })();
  
  const styleSrcAttrParts = ["'unsafe-inline'"];
  
  // Fallback style-src for CSP Level 2 browsers (no style-src-elem/style-src-attr support)
  // Include nonce and all hashes for backwards compatibility with older browsers
  // Modern browsers (CSP Level 3+) will ignore this in favor of style-src-elem/style-src-attr
  // See styleSrcElemParts comment: use the simple path outside real production.
  const styleSrcParts = !isActualProduction
    ? ["'self'", "'unsafe-inline'"]
    : [
        "'self'", 
        `'nonce-${nonce}'`, 
        "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='", // Sonner toast CSS
        "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // Empty string
        "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='", // Recharts
        "'sha256-AMd96FJ0GSrxFtEVT53SsztnJlpK57ZkVSOwhrM6Jjg='", // Next.js/React hydration
        "'sha256-DnU2FixQA4mFSjGuLz5b9dJ5ARj46/zX6IW2U4X4iIs='", // Animation libraries
        "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='", // Login/auth inline styles
        "'sha256-Q9MUdYBtYzn5frLpoNRLdFYW76cJ4ok2SmIKzTFq57Q='", // Runtime inline styles
        "'sha256-wiog7aClo6fLAZmHb/tPNxWHoZlb/gI0ju+YaSxXMrI='"  // Runtime inline styles (new)
      ];

  // Build connect-src parts, filtering out empty values from unset env vars
  const connectSrcParts = [
    "'self'",
    supabaseOrigin,
    supabaseWsUrl,
    supabaseCfProxyOrigin,
    supabaseAwsProxyOrigin,
    supabaseDevProxyOrigin,
    "https://production.api.ezygo.app",
    "https://*.ingest.sentry.io",
    "https://challenges.cloudflare.com",
    "https://cloudflareinsights.com",
    "https://static.cloudflareinsights.com",
    "https://stats.g.doubleclick.net",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    // Dev-only: HMR websockets and local server
    ...(!isActualProduction ? [
      "ws://localhost:3000",
      "ws://127.0.0.1:3000",
      "wss://localhost:3000",
      "wss://127.0.0.1:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://localhost:3000",
      "https://127.0.0.1:3000",
    ] : []),
  ].filter(Boolean);

  return [
    `default-src 'self'`,
    `script-src ${scriptSrcParts.join(" ")}`,
    `script-src-elem ${scriptSrcElemParts.join(" ")}`,
    `style-src ${styleSrcParts.join(" ")}`,
    `style-src-elem ${styleSrcElemParts.join(" ")}`,
    `style-src-attr ${styleSrcAttrParts.join(" ")}`,
    `img-src ${["'self'", "blob:", "data:", supabaseOrigin, supabaseCfProxyOrigin, supabaseAwsProxyOrigin, supabaseDevProxyOrigin, "https://www.google-analytics.com", "https://stats.g.doubleclick.net"].filter(Boolean).join(" ")}`,
    `font-src 'self' data:`,
    `media-src 'none'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-src 'self' https://challenges.cloudflare.com`,
    `frame-ancestors 'none'`,
    `worker-src 'self' blob:`,
    `connect-src ${connectSrcParts.join(" ")}`,
    ...(isActualProduction ? [
      `report-to csp-endpoint`,
      `report-uri /api/csp-report`,
      "upgrade-insecure-requests",
    ] : []),
  ].join("; ");
};