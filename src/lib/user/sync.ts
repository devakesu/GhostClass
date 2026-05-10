import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { egressFetch, redact } from "@/lib/utils.server";
import { decrypt, encrypt } from "@/lib/crypto";
import * as Sentry from "@sentry/nextjs";
import { safeResponseJson } from "@/lib/json";

interface EzygoProfileResponse {
  user_id: string | number;
  username?: string;
  email?: string;
  mobile?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  gender?: string;
  sex?: string;
  birth_date?: string;
  dob?: string;
  user?: {
    username?: string;
    email?: string;
    mobile?: string;
    id?: string | number;
  };
}

/**
 * Helper to safely parse EzyGo responses which may be naked strings or JSON objects.
 */
async function safeEzygoJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    const text = await res.text();
    if (!text || text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      // Fallback for naked strings (e.g. "Odd", "2024-25")
      return text as unknown as T;
    }
  } catch (err) {
    logger.warn("safeEzygoJson: failed to read response body:", err);
    return null;
  }
}

import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";

/**
 * Centrally performs a full profile sync from EzyGo to Supabase.
 * Handles Name, Email, Phone, Gender, Birth Date, and Academic Context.
 */
export async function performProfileSync(
  token: string,
  ezygoId: string,
  authId: string,
) {
  const supabaseAdmin = getAdminClient();

  try {
    // 1. Fetch Basic Profile, Academic Settings and Courses in parallel
    // Uses egressFetch which includes stealth headers.
    const [ezygoRes, semRaw, yearRaw, coursesRes, rolesData] = await Promise
      .all([
        egressFetch("myprofile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        egressFetch("user/setting/default_semester", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }).then(safeEzygoJson),
        egressFetch("user/setting/default_academic_year", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }).then(safeEzygoJson),
        egressFetch("institutionuser/courses/withusers", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        egressFetch("institutionuser/myroles", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }).then(safeResponseJson),
      ]);

    if (!ezygoRes.ok) {
      logger.warn(
        `performProfileSync: EzyGo Profile returned ${ezygoRes.status}`,
      );
      throw new Error(`EzyGo Profile failed: ${ezygoRes.status}`);
    }

    const json = await safeResponseJson<any>(ezygoRes);
    if (!json) {
      throw new Error(`EzyGo Profile returned empty or invalid JSON: ${ezygoRes.status}`);
    }
    const ezygoData: EzygoProfileResponse = json.data ?? json;

    // Use remote ID if local ezygoId is missing or empty
    const resolvedEzygoId = (ezygoId && String(ezygoId).trim() !== "")
      ? String(ezygoId)
      : String(ezygoData.user_id || ezygoData.user?.id || "");

    if (!resolvedEzygoId) {
      throw new Error("Missing EzyGo User ID (local and remote)");
    }

    const coursesResText = coursesRes.ok
      ? await coursesRes.clone().text().catch(() => "READ_FAILURE")
      : "NOT_OK";

    // Build Courses Map & Process Catalog
    const coursesMap: Record<string, any> = {};
    let coursesData: any[] = [];
      try {
        const parsed = await safeResponseJson<any>(coursesRes);
        if (!parsed) throw new Error("Empty courses response");
        coursesData = Array.isArray(parsed) ? parsed : (parsed.data ?? []);

        logger.dev(
          `Sync: Processing ${coursesData.length} courses for catalog. (Raw text length: ${coursesResText.length})`,
        );

        if (Array.isArray(coursesData)) {
          coursesData.forEach((c) => {
            if (c.id) coursesMap[String(c.id)] = c;
            if (c.code) {
              const normalized = String(c.code).toUpperCase().replace(/[\s\u00A0-]/g, "");
              coursesMap[normalized] = c;
            }
          });
        }
      } catch (e: any) {
        logger.error(
          `Sync: Failed to parse courses JSON: ${e.message}. Status: ${coursesRes.status}. Content Preview: ${
            coursesResText.substring(0, 100)
          }`,
        );
        coursesData = [];
      }

    // 2. Resolve Academic Info (with robust parsing and derivation)
    // Robust extraction of semester/year from EzyGo settings responses
    const extractValue = (raw: any, key: string, fallbackKeys: string[] = []): string | null => {
      if (!raw) return null;
      if (typeof raw !== "object") return String(raw);
      
      // 1. Try common top-level keys
      const keysToTry = [key, "data", "value", ...fallbackKeys];
      for (const k of keysToTry) {
        const val = raw[k];
        if (val === undefined || val === null) continue;
        
        // If primitive, use it
        if (typeof val !== "object") return String(val);
        
        // If object, check for the primary key inside it
        if (val[key] !== undefined && val[key] !== null) return String(val[key]);
      }
      return null;
    };

    const semVal = extractValue(semRaw, "default_semester", ["current_semester", "current_term", "semester"]);
    const yearVal = extractValue(yearRaw, "default_academic_year", ["current_year", "academic_year", "year"]);

    if (!semVal || !yearVal) {
      logger.dev(`[sync] Academic resolution incomplete. Raw sem=${JSON.stringify(semRaw)}, Raw year=${JSON.stringify(yearRaw)}`);
    }

    let ezygoAcademicSemester: "even" | "odd" | null = null;
    if (semVal) {
      const semStr = semVal.toLowerCase();
      if (semStr.includes("odd") || semStr === "1") {
        ezygoAcademicSemester = "odd";
      } else if (semStr.includes("even") || semStr === "2") {
        ezygoAcademicSemester = "even";
      }
    }

    const ezygoAcademicYear = yearVal;
    logger.dev(`[sync] Resolved Academic from EzyGo: sem=${ezygoAcademicSemester}, year=${ezygoAcademicYear}`);

    const currentAcademic = calculateCurrentAcademicInfo({
      year: ezygoAcademicYear,
      semester: ezygoAcademicSemester,
    });

    // 2a. Self-Healing: If EzyGo was missing data, push our derivation back to anchor it
    if (!ezygoAcademicSemester || !ezygoAcademicYear) {
      logger.info(`[sync] Self-healing academic context for ${authId}: Setting EzyGo to ${currentAcademic.current_semester} ${currentAcademic.current_year}`);
      
      const pushPromises: Promise<any>[] = [];
      if (!ezygoAcademicSemester) {
        pushPromises.push(egressFetch("user/setting/default_semester", {
          method: "POST",
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ default_semester: currentAcademic.current_semester }),
        }));
      }
      if (!ezygoAcademicYear) {
        pushPromises.push(egressFetch("user/setting/default_academic_year", {
          method: "POST",
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ default_academic_year: currentAcademic.current_year }),
        }));
      }
      
      // Fire and forget (or await if we want to be certain, but let's not block the whole sync)
      Promise.all(pushPromises).catch(err => logger.warn("[sync] Academic self-heal push failed", err));
    }

    // 2b. Class Detection & Catalog Population
    let classId: string | null = null;
    let classInfo: { id: string; name: string } | null = null;
    
    if (Array.isArray(coursesData)) {
      const roles = (rolesData as any)?.data ?? rolesData;
      const subgroupRoles = roles?.subgroupRoles || [];
      
      // Priority 1: Use courses to identify the class.
      // EzyGo's courses/withusers endpoint is ALREADY filtered by the default semester setting,
      // so the group associated with these courses is the most reliable "Active Class".
      const courseWithGroup = coursesData.find((c: any) => c.usersubgroup?.usergroup?.id);
      
      if (courseWithGroup) {
        const subgroup = courseWithGroup.usersubgroup;
        logger.dev(`Sync: Detected class from active courses: "${subgroup.name}" (ID: ${subgroup.id})`);
        
        const { data: classData, error: classError } = await supabaseAdmin
          .from("classes")
          .upsert({
            external_group_id: String(subgroup.id),
            name: subgroup.name,
          }, { onConflict: "external_group_id" })
          .select("id")
          .single();

        if (!classError && classData) {
          classId = classData.id;
          classInfo = { id: classData.id, name: subgroup.name };
        }
      }

      // Priority 2: Fallback to definitive subgroupRoles from 'myroles' endpoint
      if (!classId && subgroupRoles.length > 0) {
        const primarySubgroup = subgroupRoles[0];
        logger.dev(`Sync: Falling back to primary subgroup role: ${primarySubgroup.name} (${primarySubgroup.id})`);
        
        const { data: classData, error: classError } = await supabaseAdmin
          .from("classes")
          .upsert({
            external_group_id: String(primarySubgroup.id),
            name: primarySubgroup.name,
          }, { onConflict: "external_group_id" })
          .select("id")
          .single();

        if (!classError && classData) {
          classId = classData.id;
          classInfo = { id: classData.id, name: primarySubgroup.name };
        }
      }

      if (!classId) {
        logger.dev("Sync: No class match found in roles or course data.");
      }

      // Populate Course Mappings (Alphanumeric Code Catalog)
      const mappings = coursesData
        .filter((c) => c.id && c.code)
        .map((c) => ({
          ezygo_id: c.id,
          university_code: String(c.code).toUpperCase().replace(/[\s\u00A0-]/g, ""),
          course_name: c.name,
          last_seen_at: new Date().toISOString(),
        }));

      if (mappings.length > 0) {
        await supabaseAdmin
          .from("course_mappings")
          .upsert(mappings, { onConflict: "ezygo_id" });

        // Automated Migration: Update this user's tracker records from numeric IDs to codes
        // using the fresh mappings we just received.
        // We fetch current trackers first to avoid redundant sequential update calls.
        const { data: currentTrackers } = await supabaseAdmin
          .from("tracker")
          .select("course")
          .eq("auth_user_id", authId);

        const coursesWithTrackers = new Set(currentTrackers?.map(t => String(t.course)) || []);

        for (const m of mappings) {
          const ezygoIdStr = String(m.ezygo_id);
          // Only fire the update if we actually have tracker records using the numeric ID
          if (coursesWithTrackers.has(ezygoIdStr)) {
            logger.dev(`Sync: Migrating tracker record for ${m.university_code} (from ID: ${ezygoIdStr})`);
            await supabaseAdmin
              .from("tracker")
              .update({ course: m.university_code })
              .eq("auth_user_id", authId)
              .eq("course", ezygoIdStr);
          }
        }
      }
    }

    // 3. Resolve Merged Profile Data (Soft Sync)
    // Query by both EzyGo ID and Auth ID to ensure we find the existing row even if IDs are shifting
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select(
        "first_name, last_name, phone, phone_iv, gender, gender_iv, birth_date, birth_date_iv, terms_version, class_id",
      )
      .or(`id.eq.${resolvedEzygoId},auth_id.eq.${authId}`)
      .maybeSingle();

    const resolve = (
      local: string | null | undefined,
      remote: string | number | null | undefined,
    ) => {
      if (local && String(local).trim() !== "") return local;
      return remote ? String(remote) : null;
    };

    let localGender: string | null = null;
    let localBirthDate: string | null = null;
    let localPhone: string | null = null;

    if (existingUser) {
      if (existingUser.gender && existingUser.gender_iv) {
        try {
          localGender = decrypt(existingUser.gender_iv, existingUser.gender);
        } catch { /* ignore decryption failures on stale data */ }
      }
      if (existingUser.birth_date && existingUser.birth_date_iv) {
        try {
          localBirthDate = decrypt(
            existingUser.birth_date_iv,
            existingUser.birth_date,
          );
        } catch { /* ignore decryption failures on stale data */ }
      }
      if (existingUser.phone && existingUser.phone_iv) {
        try {
          localPhone = decrypt(existingUser.phone_iv, existingUser.phone);
        } catch { /* ignore decryption failures on stale data */ }
      }
    }

    const remoteFirst = ezygoData.first_name ||
      (ezygoData.full_name ? ezygoData.full_name.trim().split(" ")[0] : null);
    const remoteLast = ezygoData.last_name ||
      (ezygoData.full_name
        ? ezygoData.full_name.trim().split(" ").slice(1).join(" ")
        : null);

    const mergedFirst = resolve(existingUser?.first_name, remoteFirst);
    const mergedLast = resolve(existingUser?.last_name, remoteLast);
    const mergedPhone = localPhone ||
      (ezygoData.mobile ?? ezygoData.user?.mobile ?? null);
    const mergedGender = resolve(
      localGender,
      ezygoData.gender ?? ezygoData.sex,
    );
    const mergedBirthDate = resolve(
      localBirthDate,
      ezygoData.birth_date ?? ezygoData.dob,
    );

    const encPhone = mergedPhone ? encrypt(mergedPhone) : null;
    const encGender = mergedGender ? encrypt(mergedGender) : null;
    const encBirthDate = mergedBirthDate ? encrypt(mergedBirthDate) : null;

    const upsertData: any = {
      id: resolvedEzygoId,
      auth_id: authId,
      username: ezygoData.username ?? ezygoData.user?.username ?? null,
      email: ezygoData.email ?? ezygoData.user?.email ?? null,
      first_name: mergedFirst,
      last_name: mergedLast,
      phone: encPhone?.content ?? null,
      phone_iv: encPhone?.iv ?? null,
      gender: encGender?.content ?? null,
      gender_iv: encGender?.iv ?? null,
      birth_date: encBirthDate?.content ?? null,
      birth_date_iv: encBirthDate?.iv ?? null,
      last_synced_at: new Date().toISOString(),
      ezygo_created_at: (ezygoData as any).created_at || null,
      class_id: classId || existingUser?.class_id || null,
    };

    const { error: upsertError } = await supabaseAdmin
      .from("users")
      .upsert(upsertData, { onConflict: "id" });

    if (upsertError) {
      throw upsertError;
    }

    return {
      id: resolvedEzygoId,
      class: classInfo ||
        (existingUser?.class_id
          ? { id: existingUser.class_id, name: "Class" }
          : null),
      profile: {
        firstName: mergedFirst,
        lastName: mergedLast,
        username: upsertData.username,
        email: upsertData.email,
        phone: mergedPhone,
        gender: mergedGender,
        birthDate: mergedBirthDate,
        lastSyncedAt: upsertData.last_synced_at,
      },
      academic: {
        year: ezygoAcademicYear,
        semester: ezygoAcademicSemester,
        current_year: currentAcademic.current_year,
        current_semester: currentAcademic.current_semester,
      },
      courses: coursesMap,
      terms_version: existingUser?.terms_version ?? null,
      updated: true,
    };
  } catch (err: any) {
    logger.error(`Sync error for ${redact("id", authId)}:`, err);
    Sentry.captureException(err, {
      tags: { type: "sync_failed", component: "sync_service" },
      extra: { ezygoId, authId },
    });
    throw err;
  }
}
