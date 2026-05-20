import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCspHeader } from "./lib/csp";
import { TERMS_VERSION } from "./app/config/legal";
import { logger } from "./lib/logger";
import { isAuthSessionMissingError } from "./lib/security/auth";
import { decrypt } from "./lib/crypto";
import { redact } from "./lib/utils.server";

/**
 * Clears all session-related cookies on a redirect response.
 */
function clearSessionCookies(res: NextResponse, request: NextRequest) {
  res.cookies.delete('ezygo_access_token');
  res.cookies.delete('csrf_token');
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

function applyProxyHeaders(response: NextResponse, cspHeader: string, nonce: string, isApiDocs: boolean) {
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set("x-nonce", nonce);
  if (isApiDocs) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
}

function redirectWithProxyHeaders(url: URL, status: number, cspHeader: string, nonce: string, isApiDocs: boolean) {
  const response = NextResponse.redirect(url, { status });
  applyProxyHeaders(response, cspHeader, nonce, isApiDocs);
  return response;
}

async function shouldBypassTermsRedirect(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  isProd: boolean,
  response: NextResponse
): Promise<boolean> {
  try {
    const { data: userProfile } = await supabase
      .from("users")
      .select("terms_version")
      .eq("auth_id", userId)
      .single();

    if (userProfile?.terms_version === TERMS_VERSION) {
      response.cookies.set("terms_version", TERMS_VERSION, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 31536000,
      });
      return true;
    }
  } catch { /* proceed to redirect */ }

  return false;
}

function isRefreshTokenNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as { code?: unknown; status?: unknown; message?: unknown };
  return authError.code === "refresh_token_not_found"
    || (authError.status === 400 && typeof authError.message === "string" && authError.message.includes("Invalid Refresh Token"));
}

/**
 * Attempts to get the user with a single retry on network failure.
 */
async function getUserWithRetry(supabase: { auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> } }) {
  try {
    const res = await supabase.auth.getUser();
    return res;
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    const isTransient = error?.message?.includes('fetch') || 
                       error?.message?.includes('Network') || 
                       error?.status === 502 || 
                       error?.status === 503 || 
                       error?.status === 504;

    if (isTransient) {
      logger.warn("Supabase getUser network failure, retrying once...", { error });
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        return await supabase.auth.getUser();
      } catch (retryError) {
        return { data: { user: null }, error: retryError };
      }
    }
    
    return { data: { user: null }, error };
  }
}

function getJwtRemainingMaxAge(token: string, fallbackMaxAge: number): number {
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
      if (payload.exp && typeof payload.exp === "number") {
        const remainingSeconds = payload.exp - Math.floor(Date.now() / 1000);
        if (remainingSeconds <= 0) return 0;
        return Math.min(remainingSeconds, fallbackMaxAge);
      }
    }
  } catch {
    // Ignore and fallback
  }
  return fallbackMaxAge;
}

async function selfHealEzygoCookie(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  response: NextResponse,
  isProd: boolean
): Promise<void> {
  try {
    const { data: dbUser } = await supabase
      .from("users")
      .select("ezygo_token, ezygo_iv")
      .eq("auth_id", userId)
      .maybeSingle();

    if (dbUser?.ezygo_token && dbUser?.ezygo_iv) {
      const token = decrypt({ iv: dbUser.ezygo_iv, content: dbUser.ezygo_token });
      // M-1: Verify that the stored token has not expired before setting cookie
      // to avoid plant-and-fail cycles. Use 24 hours fallback instead of 31 days if not a JWT.
      const maxAge = getJwtRemainingMaxAge(token, 24 * 60 * 60);
      if (maxAge > 0) {
        response.cookies.set("ezygo_access_token", token, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge,
        });
        logger.info("EzyGo session cookie self-healed in middleware", { userId: redact("id", userId) });
      } else {
        logger.warn("EzyGo session token in DB is expired, skipping self-heal", { userId: redact("id", userId) });
      }
    }
  } catch (err) {
    logger.warn("Non-critical: EzyGo self-healing failed in middleware", err);
  }
}

async function resolveSessionUser(
  supabase: ReturnType<typeof createServerClient>,
  request: NextRequest,
  response: NextResponse,
  isProd: boolean
): Promise<{ user: { id: string } | null; isUnauthenticatedCertain: boolean }> {
  try {
    const { data, error } = await getUserWithRetry(supabase as unknown as Parameters<typeof getUserWithRetry>[0]);
    if (error) {
      if (!isRefreshTokenNotFoundError(error) && !isAuthSessionMissingError(error)) {
        logger.warn("Supabase auth refresh failed in middleware; treating as unauthenticated.", { error });
      }
      return { user: null, isUnauthenticatedCertain: true };
    }
    
    const user = data.user;
    if (!user) {
      return { user: null, isUnauthenticatedCertain: true };
    }

    const ezygoCookie = request.cookies.get("ezygo_access_token")?.value;
    if (!ezygoCookie) {
      await selfHealEzygoCookie(supabase, user.id, response, isProd);
    }

    return { user, isUnauthenticatedCertain: false };
  } catch (error) {
    logger.warn("Supabase auth getUser threw unexpectedly in middleware", { error });
    return { user: null, isUnauthenticatedCertain: true };
  }
}

async function enforceRoutingScenarios({
  request,
  response,
  user,
  isUnauthenticatedCertain,
  supabase,
  cspHeader,
  nonce,
  redirectStatus,
  isProd,
}: {
  request: NextRequest;
  response: NextResponse;
  user: { id: string } | null;
  isUnauthenticatedCertain: boolean;
  supabase: ReturnType<typeof createServerClient>;
  cspHeader: string;
  nonce: string;
  redirectStatus: number;
  isProd: boolean;
}): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
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
  const isNavigationRequest = request.method === "GET" || request.method === "HEAD";

  const isProtectedRoute = protectedRoutePrefixes.some((routePrefix) => pathname.startsWith(routePrefix));

  // Scenario A: Unauthenticated
  if (isUnauthenticatedCertain && (isProtectedRoute || isAcceptTermsRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirectRes = redirectWithProxyHeaders(url, redirectStatus, cspHeader, nonce, false);
    clearSessionCookies(redirectRes, request);
    return redirectRes;
  }

  // Scenario B: Terms Enforcement
  if (user && (!termsVersion || termsVersion !== TERMS_VERSION) && isProtectedRoute) {
    if (await shouldBypassTermsRedirect(supabase, user.id, isProd, response)) {
      return response;
    }

    const url = request.nextUrl.clone();
    // H-1: Guard against NaN — a malformed cookie value would make
    // redirectCount >= 3 always false, producing an infinite redirect loop.
    const rawRedirectCount = parseInt(request.cookies.get('terms_redirect_count')?.value ?? "0", 10);
    const redirectCount = Number.isFinite(rawRedirectCount) ? rawRedirectCount : 0;

    if (redirectCount >= 3) {
      const homeUrl = url.clone();
      homeUrl.pathname = '/';
      homeUrl.search = '';
      const logoutRes = redirectWithProxyHeaders(homeUrl, redirectStatus, cspHeader, nonce, false);
      clearSessionCookies(logoutRes, request);
      return logoutRes;
    }
    
    url.pathname = "/accept-terms";
    const redirectRes = redirectWithProxyHeaders(url, redirectStatus, cspHeader, nonce, false);
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
    const redirectRes = redirectWithProxyHeaders(url, redirectStatus, cspHeader, nonce, false);
    redirectRes.cookies.delete('terms_redirect_count');
    return redirectRes;
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = redirectWithProxyHeaders(url, redirectStatus, cspHeader, nonce, false);
    redirectRes.cookies.delete('terms_redirect_count');
    return redirectRes;
  }

  return null;
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
  if (isApiDocs) {
    // M-2: Restrict indexing under degraded CSP for Scalar docs.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // Initialize Supabase
  const isProd = process.env.NODE_ENV === "production" || process.env.FORCE_PROD_SUPABASE === "true";
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
          applyProxyHeaders(response, effectiveCspHeader, nonce, isApiDocs);
        },
      },
    }
  );

  const { user, isUnauthenticatedCertain } = await resolveSessionUser(supabase, request, response, isProd);

  const scenarioRes = await enforceRoutingScenarios({
    request,
    response,
    user,
    isUnauthenticatedCertain,
    supabase,
    cspHeader,
    nonce,
    redirectStatus,
    isProd,
  });

  if (scenarioRes !== null) {
    return scenarioRes;
  }

  return response;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml|monitoring|manifest.webmanifest|sw.js|icon|logo.png|opengraph-image|apple-icon|openapi).*)",
  ],
};
