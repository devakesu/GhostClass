import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, _customFetch } from "./fetch";

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
  const { url, key } = getSupabaseConfig('client');

  return createBrowserClient(
    url,
    key,
    _customFetch ? { global: { fetch: _customFetch } } : undefined,
  );
}