import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withSecurity } from "@/lib/security/app-check";
import { getClientIp } from "@/lib/utils.server";
import { authRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

const FcmTokenSchema = z.object({
  fcm_token: z.string().trim().min(1),
});

const postHandler = async (req: Request, { decryptedBody }: { decryptedBody?: unknown }) => {
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "Could not determine client IP" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { success, reset, remaining, limit } = await authRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const supabaseAdmin = getAdminClient();
  const authHeader = req.headers.get("authorization");
  let user: { id: string };

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    user = authUser;
  } else {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    user = authUser;
  }

  let body = decryptedBody;
  if (!body) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }

  const parsed = FcmTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  const { fcm_token } = parsed.data;

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({ fcm_token, has_mobile_app: true, updated_at: new Date().toISOString() })
    .eq("auth_id", user.id);

  if (updateError) {
    logger.error("[register-fcm] Database update failed:", updateError);
    Sentry.captureException(updateError, {
      tags: { type: "db_update_error", location: "api/auth/register-fcm" },
    });
    return NextResponse.json({ error: "Failed to register FCM token" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ success: true });
};

export const POST = withSecurity(postHandler as unknown as typeof postHandler);
