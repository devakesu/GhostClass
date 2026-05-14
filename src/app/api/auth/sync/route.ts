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
async function getUserWithRetry(
  supabaseFn: () => Promise<UserResponse>
): Promise<UserResponse> {
  try {
    return await supabaseFn();
  } catch (error) {
    logger.warn("[sync] Supabase getUser network failure, retrying once...", {
      error,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await supabaseFn();
  }
}

async function enforceAuthRateLimit(ip: string) {
  const { success, reset, limit, remaining } = await authRateLimiter.limit(
    `auth_sync_${ip}`
  );
  if (!success) {
    const waitTime = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { message: "Too many requests. Please try again later.", retryAfter: reset },
      {
        status: 429,
        headers: {
          "Retry-After": waitTime.toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    );
  }
  return null;
}

async function resolveUser(authType: string, headers: Headers) {
  if (authType === "app-check") {
    const authHeader = headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { error: "Unauthorized", status: 401 };
    }
    const token = authHeader.split(" ")[1];
    const supabaseAdmin = getAdminClient();
    const {
      data: { user },
      error,
    } = await getUserWithRetry(() => supabaseAdmin.auth.getUser(token));
    if (error || !user) {
      return { error: "Invalid session", status: 401 };
    }
    return { user };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await getUserWithRetry(() => supabase.auth.getUser());
  if (error || !user) {
    return { error: "Unauthorized", status: 401 };
  }
  return { user };
}

export const dynamic = "force-dynamic";

/**
 * Universal Authentication Sync Route
 *
 * Handles session healing for both web (cookies) and mobile (JWE/Bearer).
 * - Web: Refreshes Supabase session and heals ezygo_access_token cookie.
 * - Mobile: Returns an encrypted bundle containing the healed EzyGo token and terms status.
 */
const handler = async (
  req: Request,
  context: {
    authType?: "csrf" | "app-check" | "none";
    params: Record<string, string | string[]>;
  }
) => {
  try {
    const isMobile = context.authType === "app-check";
    const ip = getClientIp(req.headers);
    if (!ip) {
      return NextResponse.json(
        { message: "Unable to determine client IP" },
        { status: 400 }
      );
    }

    const rlResp = await enforceAuthRateLimit(ip);
    if (rlResp) return rlResp;

    const userResolution = await resolveUser(context.authType || "none", req.headers);
    if ("error" in userResolution) {
      return NextResponse.json(
        { message: userResolution.error },
        { status: userResolution.status }
      );
    }

    const { user: authUser } = userResolution;
    const bundle = await getProfileBundle(authUser.id);
    if (!bundle) {
      logger.warn("[sync] Profile not found for healing", {
        userId: redact("id", authUser.id),
      });
      return NextResponse.json(
        { success: false, message: "Profile sync failed" },
        { status: 404 }
      );
    }

    if (isMobile) {
      return NextResponse.json({
        success: true,
        ...bundle,
      });
    }

    const webToken = await getAuthTokenWithFallback();
    if (!webToken) {
      logger.warn("[sync] Web session blip detected during heal", {
        userId: redact("id", authUser.id),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Authentication healed",
    });
  } catch (err) {
    logger.error("[sync] Unexpected error during universal auth sync", err);
    Sentry.captureException(err, {
      tags: { type: "auth_sync_error", location: "api/auth/sync" },
    });
    return NextResponse.json(
      { message: "Failed to synchronize authentication. Please try again." },
      { status: 500 }
    );
  }
};

export const POST = withSecurity(handler);
