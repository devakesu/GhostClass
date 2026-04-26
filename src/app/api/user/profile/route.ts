import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { decrypt } from "@/lib/crypto";
import { withSecurity } from "@/lib/security/app-check";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/profile
 * 
 * Mobile-optimized profile bundle. This is an "uber-endpoint" that returns
 * everything the mobile app needs to bootstrap its state in a single request:
 * - Basic profile info (id, username, email, first_name, last_name)
 * - Academic context (current_semester, current_year)
 * - Decrypted EzyGo token (bridging auth for the backend proxy)
 * - User settings (bunk calculator, target percentage)
 * - Terms compliance status
 * 
 * Securely wrapped with JWE and App Check for mobile clients.
 */
const handler = async (req: Request) => {
  const supabaseAdmin = getAdminClient();
  
  // withSecurity ensures we are authenticated via either a Bearer token or cookie.
  // For mobile, we expect a Bearer token in the Authorization header.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  try {
    // 1. Fetch user profile data from the 'users' table
    // We fetch everything (*) to ensure we have all fields for the bundle.
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from("users")
      .select("*, class:classes(id, name)")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (dbError) throw dbError;
    if (!dbUser) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Map joined class data (Supabase returns this as an object or array)
    const classData = Array.isArray(dbUser.class) ? dbUser.class[0] : dbUser.class;

    // 2. Fetch user settings (bunk calculator config, etc.)
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("user_id", dbUser.id)
      .maybeSingle();

    if (settingsError) {
      logger.warn(`Failed to fetch user settings for user ${dbUser.id}`, settingsError);
    }

    // 3. Decrypt EzyGo token if present
    // This allows the mobile app to sync its local secure storage with the server's state.
    let decryptedEzygoToken: string | null = null;
    if (dbUser.ezygo_token && dbUser.ezygo_iv) {
      try {
        decryptedEzygoToken = decrypt(dbUser.ezygo_iv, dbUser.ezygo_token);
      } catch (e) {
        logger.error("Failed to decrypt EzyGo token for mobile profile bundle", e);
      }
    }

    // 4. Construct response bundle
    // We map the database fields to the mobile-optimized schema.
    const responseBody = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
      phone: (() => {
        if (!dbUser.phone) return null;
        try {
          return decrypt(dbUser.phone_iv, dbUser.phone);
        } catch (e) {
          logger.error("[profile bundle] Failed to decrypt phone (possible null IV on legacy row)", e);
          Sentry.captureException(e, {
            tags: { type: "phone_decryption_failure", location: "api/user/profile" },
          });
          return null;
        }
      })(),
      avatar_url: dbUser.avatar_url,
      
      // Academic context (cached on the user record for speed)
      current_semester: dbUser.current_semester,
      current_year: dbUser.current_year,
      
      // Compliance status
      terms_version: dbUser.terms_version,
      terms_accepted_at: dbUser.terms_accepted_at,
      
      // Auth bridge
      ezygo_token: decryptedEzygoToken,
      
      // Settings bundle (if available)
      settings: settings ? {
        bunk_calculator_enabled: settings.bunk_calculator_enabled,
        target_percentage: settings.target_percentage,
        disabled_courses: settings.disabled_courses
      } : {
        bunk_calculator_enabled: false,
        target_percentage: 75,
        disabled_courses: {}
      },
      
      // Class info (if available)
      class: classData ? {
        id: classData.id,
        name: classData.name
      } : null,
      
      created_at: dbUser.created_at
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    logger.error("API /user/profile: Bundle generation failed:", error);
    Sentry.captureException(error, { tags: { type: "profile_fetch_error", location: "api/user/profile" } });
    return NextResponse.json(
      { error: "Failed to load profile. Please try again." },
      { status: 500 }
    );
  }
};

// Wrap with security HOF to handle App Check and JWE decryption/encryption.
export const GET = withSecurity(handler as any);
