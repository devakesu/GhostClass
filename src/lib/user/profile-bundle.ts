import { getAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import { logger } from "@/lib/logger";
import type { UserProfile } from "@/types/profile";

function resolveDecryptedFields(existingUser: Record<string, unknown>) {
  const gender = existingUser.gender as string | null | undefined;
  const genderIv = existingUser.gender_iv as string | null | undefined;
  const birthDate = existingUser.birth_date as string | null | undefined;
  const birthDateIv = existingUser.birth_date_iv as string | null | undefined;
  const phone = existingUser.phone as string | null | undefined;
  const phoneIv = existingUser.phone_iv as string | null | undefined;
  const ezygoToken = existingUser.ezygo_token as string | null | undefined;
  const ezygoIv = existingUser.ezygo_iv as string | null | undefined;

  const decryptedGender =
    gender && genderIv ? decrypt({ iv: genderIv, content: gender }) : null;
  const decryptedBirthDate =
    birthDate && birthDateIv
      ? decrypt({
          iv: birthDateIv,
          content: birthDate,
        })
      : null;
  const decryptedPhone =
    phone && phoneIv ? decrypt({ iv: phoneIv, content: phone }) : null;

  let decryptedEzygoToken: string | null = null;
  if (ezygoToken && ezygoIv) {
    try {
      decryptedEzygoToken = decrypt({
        iv: ezygoIv,
        content: ezygoToken,
      });
    } catch (e) {
      logger.error("Failed to decrypt EzyGo token", e);
    }
  }

  return {
    phone: decryptedPhone,
    gender: decryptedGender,
    birth_date: decryptedBirthDate,
    ezygo_token: decryptedEzygoToken,
  };
}

function resolveSettings(settings: Record<string, unknown> | null | undefined) {
  if (!settings) {
    return {
      bunk_calculator_enabled: true,
      target_percentage: 75,
      disabled_courses: {},
      course_targets: {},
    };
  }
  return {
    bunk_calculator_enabled:
      typeof settings.bunk_calculator_enabled === "boolean"
        ? settings.bunk_calculator_enabled
        : true,
    target_percentage:
      typeof settings.target_percentage === "number"
        ? settings.target_percentage
        : 75,
    disabled_courses:
      (settings.disabled_courses as Record<string, Record<string, string>>) ||
      {},
    course_targets: (settings.course_targets as Record<string, number>) || {},
  };
}

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
  preFetchedSettings?: unknown,
): Promise<UserProfile | null> {
  const supabaseAdmin = getAdminClient();

  // 1. Fetch user and settings in parallel (resolving prefetched data if provided)
  const [userRes, settingsRes] = await Promise.all([
    preFetchedUser !== undefined
      ? Promise.resolve({ data: preFetchedUser })
      : supabaseAdmin
          .from("users")
          .select("*, class:classes(id, name, sem, year)")
          .eq("auth_id", authId)
          .maybeSingle(),
    preFetchedSettings !== undefined
      ? Promise.resolve({ data: preFetchedSettings })
      : supabaseAdmin
          .from("user_settings")
          .select("*")
          .eq("user_id", authId)
          .maybeSingle(),
  ]);

  const existingUser = userRes.data as Record<string, unknown> | null;
  const settings = settingsRes.data as Record<string, unknown> | null;

  if (!existingUser) return null;

  // 2. Resolve Academic Info (ONLY if explicitly overridden/synced)
  const academic = academicOverride
    ? calculateCurrentAcademicInfo({
        year: academicOverride.current_year || academicOverride.year,
        semester:
          academicOverride.current_semester || academicOverride.semester,
      })
    : null;

  const decrypted = resolveDecryptedFields(existingUser);

  // 3. Construct bundle
  return {
    id: Number(existingUser.id),
    username: String(existingUser.username ?? ""),
    email: String(existingUser.email ?? ""),
    first_name: existingUser.first_name
      ? String(existingUser.first_name)
      : undefined,
    last_name: existingUser.last_name ? String(existingUser.last_name) : null,
    phone: decrypted.phone,
    gender: decrypted.gender,
    birth_date: decrypted.birth_date,
    avatar_url: existingUser.avatar_url
      ? String(existingUser.avatar_url)
      : null,
    created_at: existingUser.created_at
      ? String(existingUser.created_at)
      : null,
    ezygo_created_at: existingUser.ezygo_created_at
      ? String(existingUser.ezygo_created_at)
      : null,
    class: Array.isArray(existingUser.class)
      ? existingUser.class[0]
      : (existingUser.class as UserProfile["class"]),

    // Academic context (Only included if live-fetched during sync)
    current_semester: academic?.current_semester || null,
    current_year: academic?.current_year || null,

    // Compliance status
    terms_version: String(existingUser.terms_version ?? ""),
    terms_accepted_at: existingUser.terms_accepted_at
      ? String(existingUser.terms_accepted_at)
      : null,

    // Auth bridge
    ezygo_token: decrypted.ezygo_token,

    // Settings bundle
    settings: resolveSettings(settings),
  };
}
