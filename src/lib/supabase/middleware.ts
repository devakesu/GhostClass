import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCspHeader } from "../csp";
import { logger } from "../logger";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseConfig, _customFetch } from "./fetch";

export async function updateSession(request: NextRequest, nonce?: string) {
  // 1. Get CSP Header
  const cspHeader = getCspHeader(nonce);

  // 2. Initialize the response
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // 3. Apply CSP to the initial response
  response.headers.set('Content-Security-Policy', cspHeader);

  const { url, key } = getSupabaseConfig('client');

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          
          // Supabase needs to create a NEW response to set cookies
          response = NextResponse.next({ request });
          
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          response.headers.set('Content-Security-Policy', cspHeader);
        },
      },
      ...(_customFetch ? { global: { fetch: _customFetch } } : {})
    }
  );

  try {
    await supabase.auth.getUser();
  } catch (error) {
    // If token refresh fails (e.g., missing or expired refresh token), clear invalid
    // session cookies. Only remove Supabase-managed cookies (sb-* prefix) — the SDK
    // exclusively uses this prefix, so matching on name.includes('auth') is too broad
    // and could accidentally delete unrelated cookies.
    const authCookies = request.cookies
      .getAll()
      .filter(({ name }) => name.startsWith("sb-"))
      .map(({ name }) => name);

    authCookies.forEach((name) => {
      response.cookies.delete(name);
    });

    logger.warn("Session refresh failed in middleware, clearing invalid session cookies", {
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      level: "warning",
      tags: { type: "session_refresh_failure", location: "supabase/middleware" },
    });
  }

  return response;
}