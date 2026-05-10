import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthTokenWithFallback } from "@/lib/security/auth-cookie";
import { authRateLimiter } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { getClientIp, redact } from "@/lib/utils.server";
import { withSecurity } from "@/lib/security/app-check";
import { getAdminClient } from "@/lib/supabase/admin";
import { getProfileBundle } from "@/lib/user/profile-bundle";
import { UserResponse } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

/**
 * Attempts to get the user with a single retry on network failure.
 */
async function getUserWithRetry(supabaseFn: () => Promise<UserResponse>): Promise<UserResponse> {
  try {
    return await supabaseFn();
  } catch (error) {
    logger.warn("[sync] Supabase getUser network failure, retrying once...", { error });
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await supabaseFn();
  }
}

export const dynamic = "force-dynamic";

/**
 * Universal Authentication Sync Route
 * 
 * Handles session healing for both web (cookies) and mobile (JWE/Bearer).
 * - Web: Refreshes Supabase session and heals ezygo_access_token cookie.
 * - Mobile: Returns an encrypted bundle containing the healed EzyGo token and terms status.
 */
const handler = async (req: Request, { authType }: { authType: "app-check" | "csrf" }) => {
  try {
    const headerList = req.headers;
    const isMobile = authType === "app-check";
    
    // 0. Rate limiting by IP
    const ip = getClientIp(headerList);
    if (!ip) {
      return NextResponse.json({ message: "Unable to determine client IP" }, { status: 400 });
    }

    const { success, reset, limit, remaining } = await authRateLimiter.limit(`auth_sync_${ip}`);
    if (!success) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later.", retryAfter: reset },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString(),
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        },
      );
    }

    // 1. Auth Context Resolution
    const supabaseAdmin = getAdminClient();
    let authUser;

    if (isMobile) {
      const authHeader = headerList.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      const token = authHeader.split(" ")[1];
      const { data: { user }, error } = await getUserWithRetry(() => supabaseAdmin.auth.getUser(token));
      if (error || !user) {
        return NextResponse.json({ message: "Invalid session" }, { status: 401 });
      }
      authUser = user;
    } else {
      const supabase = await createClient();
      const { data: { user }, error } = await getUserWithRetry(() => supabase.auth.getUser());
      if (error || !user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      authUser = user;
    }

    // 2. Heal EzyGo Token & Return Full Bundle
    const bundle = await getProfileBundle(authUser.id);
    if (!bundle) {
      logger.warn("[sync] Profile not found for healing", { userId: redact("id", authUser.id) });
      return NextResponse.json({ success: false, message: "Profile sync failed" }, { status: 404 });
    }

    if (isMobile) {
      // Mobile expects the full encrypted payload (now unified with /api/profile)
      return NextResponse.json({
        success: true,
        ...bundle
      });
    } else {
      // Web uses cookies; check if they are already present
      // getAuthTokenWithFallback() performs the actual healing if cookie is missing
      const webToken = await getAuthTokenWithFallback();
      if (!webToken) {
        logger.warn("[sync] Web session blip detected during heal", { userId: redact("id", authUser.id) });
      }
      
      return NextResponse.json({ success: true, message: "Authentication healed" });
    }
  } catch (err) {
    logger.error("[sync] Unexpected error during universal auth sync", err);
    Sentry.captureException(err, { tags: { type: "auth_sync_error", location: "api/auth/sync" } });
    return NextResponse.json({ message: "Failed to synchronize authentication. Please try again." }, { status: 500 });
  }
};

export const POST = withSecurity(handler as any);
