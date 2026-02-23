import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCspHeader } from "./lib/csp";
import { TERMS_VERSION } from "./app/config/legal";
import { logger } from "./lib/logger";

/**
 * Clears all session-related cookies on a redirect response.
 * Deletes custom app cookies plus the Supabase SSR auth cookie (including
 * any chunked variants) derived from NEXT_PUBLIC_SUPABASE_URL.
 * Call this on every logout/unauthenticated-redirect path so that adding a
 * new session cookie only requires a change here, not in every branch.
 */
function clearSessionCookies(res: NextResponse, request: NextRequest) {
  res.cookies.delete('ezygo_access_token');
  res.cookies.delete('terms_version');
  res.cookies.delete('csrf_token');
  res.cookies.delete('terms_redirect_count');
  try {
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
    if (projectRef) {
      const sbCookieName = `sb-${projectRef}-auth-token`;
      res.cookies.delete(sbCookieName);
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith(`${sbCookieName}.`)) {
          res.cookies.delete(c.name);
        }
      }
    }
  } catch {
    // Non-critical: cookie expiry handles it naturally
  }
}

/**
 * Creates a cryptographically secure nonce for CSP.
 * Uses Web Crypto API for compatibility with both Node.js and Edge runtimes.
 */
function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Convert to base64 using btoa and proper string conversion
  // This works in both Node.js (v20+) and Edge runtime
  return btoa(String.fromCharCode(...bytes));
}

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // 1. Get CSP Header
  const cspHeader = getCspHeader(nonce);

  // 2. Initialize Response with nonce in headers for Next.js to use
  let response = NextResponse.next({
    request: { 
      headers: requestHeaders 
    },
  });

  // 3. Apply CSP to the initial response
  // x-nonce is attached to the *request* (see requestHeaders + NextResponse.next above)
  // so that Next.js Server Components can read it via headers() and inject it into inline
  // <script>/<style> tags (e.g., in layout.tsx). We also mirror it on the response header.
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set("x-nonce", nonce);

  // 4. Initialize Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );

          // ⚠️ CRITICAL: Re-apply CSP and nonce to the new response
          response.headers.set('Content-Security-Policy', cspHeader);
          response.headers.set("x-nonce", nonce);
        },
      },
    }
  );

  // 5. Refresh Session
  const { data: { user } } = await supabase.auth.getUser();

  // 6. Routing Logic
  const termsVersion = request.cookies.get("terms_version")?.value;
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isProfileRoute = request.nextUrl.pathname.startsWith("/profile");
  const isNotificationsRoute = request.nextUrl.pathname.startsWith("/notifications");
  const isTrackingRoute = request.nextUrl.pathname.startsWith("/tracking");
  const isScoresRoute = request.nextUrl.pathname.startsWith("/scores");
  const isAuthRoute = request.nextUrl.pathname === "/";
  const isAcceptTermsRoute = request.nextUrl.pathname === "/accept-terms";

  // Protected routes that require authentication and terms acceptance
  const isProtectedRoute = isDashboardRoute || isProfileRoute || isNotificationsRoute || isTrackingRoute || isScoresRoute;

  // Scenario A: Unauthenticated users cannot access protected routes or accept-terms page
  if (!user && (isProtectedRoute || isAcceptTermsRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    // No valid Supabase session — wipe all session cookies so stale state from
    // a previous user cannot be inherited by the next user on the same device.
    clearSessionCookies(redirectRes, request);
    return redirectRes;
  }

  // Scenario B: Logged in but terms not accepted or outdated -> Redirect to Accept Terms
  // Note: /accept-terms requires authentication (handled in Scenario A.1), but is accessible with outdated/missing terms
  // Explicitly check for null/undefined termsVersion or version mismatch
  if (user && (!termsVersion || termsVersion !== TERMS_VERSION) && isProtectedRoute) {
    const url = request.nextUrl.clone();
    
    // Redirect loop protection: use httpOnly cookie to track redirect attempts
    // This prevents manipulation via URL parameters which could be exploited for DoS
    const redirectCountCookie = request.cookies.get('terms_redirect_count');
    const raw = redirectCountCookie?.value;
    const redirectCount = (raw && /^\d+$/.test(raw)) ? parseInt(raw, 10) : 0;
    
    if (redirectCount >= 3) {
      // Too many redirect attempts — force-clear all session cookies and send to login.
      // Redirecting to a non-existent /logout page would 404; we clear state here directly
      // instead. Client-side storage (localStorage and sessionStorage) will be cleared by handleLogout when
      // ProtectedLayout detects the missing session on the next protected-route visit.
      logger.warn('Terms acceptance redirect loop detected. Logging user out.', {
        redirectCount,
        termsVersion: termsVersion || 'none',
        expectedVersion: TERMS_VERSION
      });

      const homeUrl = url.clone();
      homeUrl.pathname = '/';
      homeUrl.search = '';
      const logoutRes = NextResponse.redirect(homeUrl);
      logoutRes.headers.set('Content-Security-Policy', cspHeader);
      logoutRes.headers.set("x-nonce", nonce);
      clearSessionCookies(logoutRes, request);
      return logoutRes;
    }
    
    url.pathname = "/accept-terms";
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    // Increment redirect count in httpOnly cookie (secure, non-manipulable)
    redirectRes.cookies.set('terms_redirect_count', String(redirectCount + 1), {
      httpOnly: true,
      secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 300, // 5 minutes - enough for legitimate redirects, prevents long-term accumulation
    });
    return redirectRes;
  }

  // Scenario C: Terms accepted but on accept-terms page -> Redirect to Dashboard
  if (user && termsVersion === TERMS_VERSION && isAcceptTermsRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    // Clear the redirect count cookie after successful terms acceptance
    redirectRes.cookies.delete('terms_redirect_count');
    return redirectRes;
  }

  // Scenario D: Logged in -> Redirect to Dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('Content-Security-Policy', cspHeader);
    redirectRes.headers.set("x-nonce", nonce);
    return redirectRes;
  }

  return response;
}

export const config = {
  // Match all routes except:
  // - Static assets (_next/static, _next/image, favicon.ico, robots.txt)
  // - API routes (handled separately with their own auth)
  // 
  // This simplified matcher pattern uses a negative lookahead regex to exclude specific paths.
  // Any new routes will automatically have CSP headers and Supabase session refresh applied.
  // 
  // Pattern explanation: /((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)
  // - Matches all paths that DON'T START with: api, _next/static, _next/image, favicon.ico, or robots.txt
  // - The negative lookahead (?!...) is evaluated at match time to exclude specific paths
  // 
  // This ensures middleware runs on all page routes for proper security headers and auth handling.
  // Public routes like /health are under /api and are excluded by the 'api' pattern.
  // Static files in /public are served directly and don't go through middleware.
  // If you need to add more exclusions (e.g., /sitemap.xml), add them to the pattern below.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};