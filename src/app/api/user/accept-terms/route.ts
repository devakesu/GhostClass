import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { withSecurity } from "@/lib/security/app-check";

export const dynamic = "force-dynamic";

/**
 * Global POST endpoint for accepting terms and conditions.
 * Used by the mobile app to sync compliance status.
 *
 * Logic matches acceptTermsAction in src/app/actions/user.ts
 */
const handler = async (req: Request) => {
  const supabaseAdmin = getAdminClient();

  // withSecurity handles auth and JWE. We expect a Bearer token or cookie.
  const authHeader = req.headers.get("Authorization");
  let authUser;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    authUser = user;
  } else {
    // Fallback or unauthorized? withSecurity handles basic checks, but we need the user object.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body;
  try {
    body = await req.json();
  } catch (_err) {
    logger.warn(`[accept-terms] Failed to parse request body:`, _err);
    return NextResponse.json({ error: "Invalid request body" }, {
      status: 400,
    });
  }

  const { version } = body;
  if (!version) {
    return NextResponse.json({ error: "Version is required" }, { status: 400 });
  }

  // 3. Update database
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: version,
    })
    .eq("auth_id", authUser.id);

  if (error) {
    logger.error("API /user/accept-terms: Database update failed:", error);
    return NextResponse.json({ error: "Failed to update terms acceptance" }, {
      status: 500,
    });
  }

  logger.info("API /user/accept-terms: Success", { userId: authUser.id, version });

  return NextResponse.json({ success: true, version });
};

export const POST = withSecurity(handler as any);
