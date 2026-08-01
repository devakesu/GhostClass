import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookie } from "@/lib/security/auth-cookie";
import { isCookieSecure } from "@/lib/security/cookie-utils";
import { removeCsrfToken } from "@/lib/security/csrf";
import {
  clearTermsRedirectCountCookie,
  clearTermsVersionCookie,
} from "@/app/actions/user";
import { authRateLimiter } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { withSecurity } from "@/lib/security/app-check";
import { getSupabaseConfig } from "@/lib/supabase/fetch";

const handler = async (req: NextRequest) => {
  // Rate limiting — prevents flooding the logout endpoint even with a valid CSRF token
  const ip = getClientIp(req.headers);
  if (!ip) {
    logger.warn(
      "POST /api/logout: missing client IP; rejecting request to avoid bypassing rate limiting",
    );
    return NextResponse.json(
      { message: "Unable to determine client IP for rate limiting." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { success, reset, limit, remaining } = await authRateLimiter.limit(
    `logout_${ip}`,
  );
  if (!success) {
    return NextResponse.json(
      { message: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": Math.max(0, Math.ceil((reset - Date.now()) / 1000))
            .toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    );
  }

  await clearAuthCookie();
  await removeCsrfToken();
  await clearTermsVersionCookie();
  await clearTermsRedirectCountCookie();

  // Clear the Supabase SSR session cookie (@supabase/ssr sets this as
  // sb-{project-ref}-auth-token). On account deletion supabase.auth.signOut()
  // fails client-side because the auth user is already gone, so this cookie
  // would otherwise remain. We derive the name from NEXT_PUBLIC_SUPABASE_URL
  // which is always available in the server runtime.
  try {
    const supabaseUrl = getSupabaseConfig("client").url;
    // URL pattern: https://{project-ref}.supabase.co
    const projectRef = new URL(supabaseUrl || "").hostname.split(".")[0];
    if (projectRef) {
      const cookieStore = await cookies();
      const cookieName = `sb-${projectRef}-auth-token`;
      cookieStore.set(cookieName, "", {
        path: "/",
        expires: new Date(0),
        sameSite: "lax",
        secure: isCookieSecure(),
      });
      // @supabase/ssr may also write a chunked variant: sb-{ref}-auth-token.0, .1 …
      // Clear any chunks present in the current request cookies.
      const allCookies = cookieStore.getAll();
      for (const c of allCookies) {
        if (c.name.startsWith(`${cookieName}.`)) {
          cookieStore.set(c.name, "", {
            path: "/",
            expires: new Date(0),
            sameSite: "lax",
            secure: isCookieSecure(),
          });
        }
      }
    }
  } catch {
    // Non-critical: if URL parsing fails the cookie just expires naturally
  }

  return NextResponse.json({ ok: true });
};

export const POST = withSecurity(handler);
