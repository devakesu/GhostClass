import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { decrypt } from "@/lib/crypto";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import { withSecurity } from "@/lib/security/app-check";
import { logger } from "@/lib/logger";
import { performProfileSync } from "@/lib/user/sync";

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
    const { data: dbUserRaw, error: dbError } = await supabaseAdmin
      .from("users")
      .select("*, class:classes(id, name)")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (dbError) throw dbError;
    if (!dbUserRaw) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    let dbUser = dbUserRaw;
    const searchParams = new URL(req.url).searchParams;
    const shouldSync = searchParams.get("sync") === "true";

    if (shouldSync && dbUser.ezygo_token && dbUser.ezygo_iv) {
      try {
        const decryptedToken = decrypt(dbUser.ezygo_iv, dbUser.ezygo_token);
        if (decryptedToken) {
          // Block until EzyGo profile/courses sync completes
          await performProfileSync(decryptedToken, dbUser.id, user.id);
          
          // Refetch to get fresh data
          const { data: updatedUser } = await supabaseAdmin
            .from("users")
            .select("*, class:classes(id, name)")
            .eq("auth_id", user.id)
            .single();
          if (updatedUser) dbUser = updatedUser;
        }
      } catch (err) {
        logger.warn("[profile bundle] Synchronous sync failed", err);
      }
    }

    if (!dbUser) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Map joined class data (Supabase returns this as an object or array)
    const classData = Array.isArray(dbUser.class) ? dbUser.class[0] : dbUser.class;

    // 2. Fetch user settings (bunk calculator config, etc.)
    // Note: user_settings uses the Supabase Auth UUID (user.id), not the EzyGo bigint ID.
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      logger.warn(`Failed to fetch user settings for auth user ${user.id}`, settingsError);
    }

    // 3. Resolve Academic Context
    // We prefer the cached values on the user record, falling back to real-time derivation.
    // Note: Future migration should ensure these are always synced to the users table.
    const academic = calculateCurrentAcademicInfo({
      semester: dbUser.current_semester,
      year: dbUser.current_year
    });

    // 4. Decrypt EzyGo token if present
    // This allows the mobile app to sync its local secure storage with the server's state.
    let decryptedEzygoToken: string | null = null;
    if (dbUser.ezygo_token && dbUser.ezygo_iv) {
      try {
        decryptedEzygoToken = decrypt(dbUser.ezygo_iv, dbUser.ezygo_token);
      } catch (e) {
        logger.error("Failed to decrypt EzyGo token for mobile profile bundle", e);
      }
    }

    // 5. Construct response bundle
    // We map the database fields to the mobile-optimized schema.
    const responseBody = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
      phone: (() => {
        if (!dbUser.phone || !dbUser.phone_iv) return null;
        try {
          return decrypt(dbUser.phone_iv, dbUser.phone);
        } catch (e) {
          logger.error("[profile bundle] Failed to decrypt phone", e);
          return null;
        }
      })(),
      avatar_url: dbUser.avatar_url,
      gender: (() => {
        if (!dbUser.gender || !dbUser.gender_iv) return null;
        try {
          return decrypt(dbUser.gender_iv, dbUser.gender);
        } catch (e) {
          logger.error("[profile bundle] Failed to decrypt gender", e);
          return null;
        }
      })(),
      birth_date: (() => {
        if (!dbUser.birth_date || !dbUser.birth_date_iv) return null;
        try {
          return decrypt(dbUser.birth_date_iv, dbUser.birth_date);
        } catch (e) {
          logger.error("[profile bundle] Failed to decrypt birth_date", e);
          return null;
        }
      })(),
      
      // Academic context
      current_semester: academic.current_semester,
      current_year: academic.current_year,
      
      // Compliance status
      terms_version: dbUser.terms_version,
      terms_accepted_at: dbUser.terms_accepted_at,
      
      // Auth bridge
      ezygo_token: decryptedEzygoToken,
      
      // Settings bundle (if available)
      settings: settings ? {
        bunk_calculator_enabled: settings.bunk_calculator_enabled,
        target_percentage: settings.target_percentage,
        disabled_courses: settings.disabled_courses || {}
      } : {
        bunk_calculator_enabled: true, // Default to true for better UX
        target_percentage: 75,
        disabled_courses: {}
      },
      
      // Class info (if available)
      class: classData ? {
        id: classData.id,
        name: classData.name
      } : null,
      
      created_at: dbUser.created_at,
      ezygo_created_at: dbUser.ezygo_created_at
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
