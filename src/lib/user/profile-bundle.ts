import { getAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import { logger } from "@/lib/logger";

/**
 * Resolves a complete profile bundle for a user.
 *
 * @param authId - Supabase auth UUID
 * @param academicOverride - Optional live academic context from EzyGo
 * @returns Full profile bundle or null if not found
 */
export async function getProfileBundle(
  authId: string,
  academicOverride?: {
    current_semester?: string | null;
    current_year?: string | null;
    semester?: string | null;
    year?: string | null;
  },
  preFetchedUser?: unknown,
) {
  const supabaseAdmin = getAdminClient();

  // 1. Fetch user and settings in parallel
  const [userRes, settingsRes] = await Promise.all([
    preFetchedUser
      ? Promise.resolve({ data: preFetchedUser })
      : supabaseAdmin.from("users").select(
        "*, class:classes(id, name, sem, year)",
      ).eq("auth_id", authId).maybeSingle(),
    supabaseAdmin.from("user_settings").select("*").eq("user_id", authId)
      .maybeSingle(),
  ]);

  const existingUser = userRes.data;
  const settings = settingsRes.data;

  if (!existingUser) return null;

  // 2. Resolve Academic Info (ONLY if explicitly overridden/synced)
  const academic = academicOverride
    ? calculateCurrentAcademicInfo({
      year: academicOverride.current_year || academicOverride.year,
      semester: academicOverride.current_semester || academicOverride.semester,
    })
    : null;

  // 2. Resolve decrypted fields
  const decryptedGender = existingUser.gender && existingUser.gender_iv
    ? decrypt({ iv: existingUser.gender_iv, content: existingUser.gender })
    : null;
  const decryptedBirthDate =
    existingUser.birth_date && existingUser.birth_date_iv
      ? decrypt({
        iv: existingUser.birth_date_iv,
        content: existingUser.birth_date,
      })
      : null;
  const decryptedPhone = existingUser.phone && existingUser.phone_iv
    ? decrypt({ iv: existingUser.phone_iv, content: existingUser.phone })
    : null;

  let decryptedEzygoToken: string | null = null;
  if (existingUser.ezygo_token && existingUser.ezygo_iv) {
    try {
      decryptedEzygoToken = decrypt({
        iv: existingUser.ezygo_iv,
        content: existingUser.ezygo_token,
      });
    } catch (e) {
      logger.error("Failed to decrypt EzyGo token", e);
    }
  }

  // 3. Construct bundle
  return {
    id: existingUser.id,
    username: existingUser.username,
    email: existingUser.email,
    first_name: existingUser.first_name,
    last_name: existingUser.last_name,
    phone: decryptedPhone,
    gender: decryptedGender,
    birth_date: decryptedBirthDate,
    avatar_url: existingUser.avatar_url,
    created_at: existingUser.created_at,
    ezygo_created_at: existingUser.ezygo_created_at,
    class: Array.isArray(existingUser.class)
      ? existingUser.class[0]
      : existingUser.class,

    // Academic context (Only included if live-fetched during sync)
    current_semester: academic?.current_semester || null,
    current_year: academic?.current_year || null,

    // Compliance status
    terms_version: existingUser.terms_version,
    terms_accepted_at: existingUser.terms_accepted_at,

    // Auth bridge
    ezygo_token: decryptedEzygoToken,

    // Settings bundle
    settings: settings
      ? {
        bunk_calculator_enabled: settings.bunk_calculator_enabled,
        target_percentage: settings.target_percentage,
        disabled_courses: settings.disabled_courses || {},
      }
      : {
        bunk_calculator_enabled: true,
        target_percentage: 75,
        disabled_courses: {},
      },
  };
}
