import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCspHeader } from "./lib/csp";
import { TERMS_VERSION } from "./app/config/legal";
import { logger } from "./lib/logger";
import { isAuthSessionMissingError } from "./lib/security/auth";

/**
 * Clears all session-related cookies on a redirect response.
 */
function clearSessionCookies(res: NextResponse, request: NextRequest) {
  res.cookies.delete('ezygo_access_token');
  res.cookies.delete('terms_version');
  res.cookies.delete('terms_redirect_count');
  
  try {
    const allCookies = request.cookies.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
        res.cookies.delete(cookie.name);
      }
    }
  } catch (e) {
    logger.warn("Non-critical: Failed to clear some session cookies in middleware", e);
  }
}

/**
 * Creates a cryptographically secure nonce for CSP.
 */
function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function isRefreshTokenNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as { code?: unknown; status?: unknown; message?: unknown };
  return authError.code === "refresh_token_not_found"
    || (authError.status === 400 && typeof authError.message === "string" && authError.message.includes("Invalid Refresh Token"));
}

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const isNavigationRequest = request.method === "GET" || request.method === "HEAD";
  const redirectStatus = isNavigationRequest ? 307 : 303;

  const cspHeader = getCspHeader(nonce);
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const pathname = request.nextUrl.pathname;
  const isApiDocs = pathname === '/api-docs' || pathname.startsWith('/api-docs/');
  const effectiveCspHeader = isApiDocs
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://cdn.jsdelivr.net",
        "connect-src 'self' https://cdn.jsdelivr.net",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join("; ")
    : cspHeader;
    
  response.headers.set('Content-Security-Policy', effectiveCspHeader);
  response.headers.set("x-nonce", nonce);

  // Initialize Supabase
  const isProd = process.env.NODE_ENV === "production";
  const supabaseUrl = (!isProd && process.env.NEXT_PUBLIC_SUPABASE_DEV_URL)
    ? process.env.NEXT_PUBLIC_SUPABASE_DEV_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = (!isProd && process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY)
    ? process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          response.headers.set('Content-Security-Policy', effectiveCspHeader);
          response.headers.set("x-nonce", nonce);
        },
      },
    }
  );

  let user: any = null;
  let isUnauthenticatedCertain = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isRefreshTokenNotFoundError(error) || isAuthSessionMissingError(error)) {
        isUnauthenticatedCertain = true;
      } else {
        logger.warn("Supabase auth refresh failed in middleware; proceeding as potentially authenticated.", { error });
      }
    } else {
      user = data.user;
      if (!user) isUnauthenticatedCertain = true;
    }
  } catch (error) {
    logger.warn("Supabase auth getUser threw unexpectedly in middleware", { error });
    isUnauthenticatedCertain = true;
  }

  const termsVersion = request.cookies.get("terms_version")?.value;
  const protectedRoutePrefixes = [
    "/dashboard",
    "/profile",
    "/notifications",
    "/tracking",
    "/scores",
    "/leave-applications",
  ];
  const isAuthRoute = pathname === "/";
  const isAcceptTermsRoute = pathname === "/accept-terms";

  const isProtectedRoute = protectedRoutePrefixes.some((routePrefix) => pathname.startsWith(routePrefix));

  // Scenario A: Unauthenticated
  if (isUnauthenticatedCertain && (isProtectedRoute || isAcceptTermsRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirectRes = NextResponse.redirect(url, { status: redirectStatus });
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    clearSessionCookies(redirectRes, request);
    return redirectRes;
  }

  // Scenario B: Terms Enforcement
  if (user && (!termsVersion || termsVersion !== TERMS_VERSION) && isProtectedRoute) {
    try {
      const { data: userProfile } = await supabase
        .from("users")
        .select("terms_version")
        .eq("auth_id", user.id)
        .single();

      if (userProfile?.terms_version === TERMS_VERSION) {
        response.cookies.set("terms_version", TERMS_VERSION, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 31536000,
        });
        return response;
      }
    } catch { /* proceed to redirect */ }

    const url = request.nextUrl.clone();
    const redirectCount = parseInt(request.cookies.get('terms_redirect_count')?.value || "0", 10);
    
    if (redirectCount >= 3) {
      const homeUrl = url.clone();
      homeUrl.pathname = '/';
      homeUrl.search = '';
      const logoutRes = NextResponse.redirect(homeUrl, { status: redirectStatus });
      logoutRes.headers.set('Content-Security-Policy', cspHeader);
      logoutRes.headers.set("x-nonce", nonce);
      clearSessionCookies(logoutRes, request);
      return logoutRes;
    }
    
    url.pathname = "/accept-terms";
    const redirectRes = NextResponse.redirect(url, { status: redirectStatus });
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    redirectRes.cookies.set('terms_redirect_count', String(redirectCount + 1), {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 300,
    });
    return redirectRes;
  }

  // Scenario C: Already Accepted Terms
  if (user && termsVersion === TERMS_VERSION && isAcceptTermsRoute && isNavigationRequest) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = NextResponse.redirect(url, { status: redirectStatus });
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    redirectRes.cookies.delete('terms_redirect_count');
    return redirectRes;
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = NextResponse.redirect(url, { status: redirectStatus });
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    redirectRes.cookies.delete('terms_redirect_count');
    return redirectRes;
  }

  return response;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml|monitoring|manifest.webmanifest|sw.js|icon|logo.png|opengraph-image|apple-icon|openapi).*)",
  ],
};
