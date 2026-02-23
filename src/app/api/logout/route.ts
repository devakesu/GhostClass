import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookie } from "@/lib/security/auth-cookie";
import { removeCsrfToken, validateCsrfToken } from "@/lib/security/csrf";
import { clearTermsVersionCookie, clearTermsRedirectCountCookie } from "@/app/actions/user";

export async function POST(req: NextRequest) {
  // CSRF protection: Prevent unauthorized logout attacks
  // Without this check, an attacker could log out users by embedding
  // a POST request to this endpoint on a malicious page
  const csrfToken = req.headers.get("x-csrf-token");
  const csrfValid = await validateCsrfToken(csrfToken);
  
  if (!csrfValid) {
    return NextResponse.json(
      { message: "Invalid CSRF token" },
      { status: 403 }
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    // URL pattern: https://{project-ref}.supabase.co
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    if (projectRef) {
      const cookieStore = await cookies();
      const cookieName = `sb-${projectRef}-auth-token`;
      cookieStore.set(cookieName, "", {
        path: "/",
        expires: new Date(0),
        sameSite: "lax",
        secure: process.env.HTTPS === "true" || process.env.NODE_ENV === "production",
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
            secure: process.env.HTTPS === "true" || process.env.NODE_ENV === "production",
          });
        }
      }
    }
  } catch {
    // Non-critical: if URL parsing fails the cookie just expires naturally
  }

  return NextResponse.json({ ok: true });
}