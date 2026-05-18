import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { egressFetch, redact } from "@/lib/utils.server";
import { decrypt, encrypt } from "@/lib/crypto";
import * as Sentry from "@sentry/nextjs";
import { safeResponseJson } from "@/lib/json";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";

interface EzygoProfileResponse {
  user_id?: string | number;
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

interface CourseItem {
  id?: string | number;
  code?: string;
  name?: string;
  usersubgroup?: {
    id?: string | number;
    name?: string;
    /** Stable section-level ID — confirmed constant across semester transitions.
     *  Preferred over usersubgroup.id (semester-scoped) for classes.external_group_id. */
    programme_config_group_id?: string | number;
    usergroup?: {
      id?: string | number;
      /** Programme display name (e.g. "Computer Science and Business Systems") */
      name?: string;
    };
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

async function processCoursesData(coursesRes: Response): Promise<{ coursesMap: Record<string, CourseItem>; coursesList: CourseItem[] }> {
  let coursesList: CourseItem[] = [];
  const entries: [string, CourseItem][] = [];
  try {
    const parsed = await safeResponseJson<{ data?: CourseItem[] } | CourseItem[]>(coursesRes);
    if (!parsed) return { coursesMap: {}, coursesList: [] };
    const safeGet = (obj: unknown, prop: string) => obj && typeof obj === "object" ? Reflect.get(obj, prop) : undefined;
    coursesList = Array.isArray(parsed) ? parsed : ((safeGet(parsed, "data") as CourseItem[] | undefined) ?? []);

    if (Array.isArray(coursesList)) {
      for (const c of coursesList) {
        if (c.id) {
          entries.push([String(c.id), c]);
        }
        if (c.code) {
          const normalized = String(c.code).toUpperCase().replace(/[\s\u00A0-]/g, "");
          entries.push([normalized, c]);
        }
      }
    }
  } catch (err) {
    logger.error("Sync: Failed to parse courses JSON", err instanceof Error ? err : new Error(String(err)));
  }
  return { coursesMap: Object.fromEntries(entries), coursesList };
}

function extractAcademicSettingValue(raw: unknown, primaryKey: string, fallbackKeys: string[] = []): string | null {
  if (!raw) return null;
  if (typeof raw !== "object") return String(raw);

  const safeGet = (obj: unknown, prop: string) => {
    if (obj && typeof obj === "object") return Reflect.get(obj, prop);
    return undefined;
  };

  const keysToTry = [primaryKey, "data", "value", ...fallbackKeys];
  for (const k of keysToTry) {
    const val = safeGet(raw, k);
    if (val === undefined || val === null) continue;

    if (typeof val !== "object") return String(val);

    const innerVal = safeGet(val, primaryKey);
    if (innerVal !== undefined && innerVal !== null) return String(innerVal);
  }
  return null;
}

function resolveAcademicContext(semRaw: unknown, yearRaw: unknown) {
  const semVal = extractAcademicSettingValue(semRaw, "default_semester", ["current_semester", "current_term", "semester"]);
  const yearVal = extractAcademicSettingValue(yearRaw, "default_academic_year", ["current_year", "academic_year", "year"]);

  let ezygoAcademicSemester: "even" | "odd" | null = null;
  if (semVal) {
    const semStr = semVal.toLowerCase();
    if (semStr.includes("odd") || semStr === "1") {
      ezygoAcademicSemester = "odd";
    } else if (semStr.includes("even") || semStr === "2") {
      ezygoAcademicSemester = "even";
    }
  }

  const currentAcademic = calculateCurrentAcademicInfo({
    year: yearVal,
    semester: ezygoAcademicSemester,
  });

  return {
    ezygoAcademicSemester,
    ezygoAcademicYear: yearVal,
    currentAcademic,
  };
}

function triggerAcademicSelfHeal(
  token: string,
  authId: string,
  ezygoAcademicSemester: string | null,
  ezygoAcademicYear: string | null,
  currentAcademic: { current_semester: string; current_year: string },
) {
  if (ezygoAcademicSemester && ezygoAcademicYear) return;

  logger.info(`[sync] Self-healing academic context for ${authId}: Setting EzyGo to ${currentAcademic.current_semester} ${currentAcademic.current_year}`);

  const pushPromises: Promise<unknown>[] = [];
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

  Promise.all(pushPromises).catch(err => logger.warn("[sync] Academic self-heal push failed", err));
}

interface RoleSubgroup {
  id?: string | number;
  name?: string;
}

/** Upserts a row in the `classes` table and returns its Supabase UUID + display name. */
async function upsertClass(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  externalId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("classes")
    .upsert({ external_group_id: externalId, name }, { onConflict: "external_group_id" })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id, name };
}

async function detectAndSyncClass(
  coursesList: CourseItem[],
  rolesData: unknown,
): Promise<{ classId: string | null; classInfo: { id: string; name: string } | null }> {
  const supabaseAdmin = getAdminClient();

  const safeGet = (obj: unknown, prop: string) => obj && typeof obj === "object" ? Reflect.get(obj, prop) : undefined;
  const rolesObj = safeGet(rolesData, "data") ?? rolesData;
  const subgroupRoles = Array.isArray(safeGet(rolesObj, "subgroupRoles"))
    ? (safeGet(rolesObj, "subgroupRoles") as RoleSubgroup[])
    : [];

  // Priority 1: course usersubgroup.
  // Identity preference:
  //   1. programme_config_group_id — section-level, confirmed stable across
  //      consecutive semesters (S1 id=9888 → S2 id=11509, pcg stayed 710).
  //   2. usergroup.id — programme-level fallback when pcg is absent.
  const courseWithGroup = coursesList.find(
    c => c.usersubgroup?.programme_config_group_id != null
      || c.usersubgroup?.usergroup?.id != null,
  );

  if (courseWithGroup?.usersubgroup) {
    const sub = courseWithGroup.usersubgroup;
    const stableId = sub.programme_config_group_id ?? sub.usergroup?.id;
    const displayName = sub.name ?? sub.usergroup?.name ?? "";
    if (stableId != null && displayName) {
      const classInfo = await upsertClass(supabaseAdmin, String(stableId), displayName);
      if (classInfo) return { classId: classInfo.id, classInfo };
    }
  }

  // Priority 2: subgroupRoles fallback (institutionuser/myroles).
  const primarySubgroup = subgroupRoles[0];
  if (primarySubgroup?.name && primarySubgroup.id) {
    const classInfo = await upsertClass(supabaseAdmin, String(primarySubgroup.id), primarySubgroup.name);
    if (classInfo) return { classId: classInfo.id, classInfo };
  }

  return { classId: null, classInfo: null };
}

async function populateCourseCatalogAndMigrateTrackers(
  coursesList: CourseItem[],
  authId: string,
): Promise<void> {
  const supabaseAdmin = getAdminClient();
  const mappings = coursesList
    .filter(c => c.id !== undefined && c.id !== null && c.code)
    .map(c => ({
      ezygo_id: String(c.id),
      university_code: String(c.code).toUpperCase().replace(/[\s\u00A0-]/g, ""),
      course_name: c.name,
      last_seen_at: new Date().toISOString(),
    }));

  if (mappings.length > 0) {
    await supabaseAdmin
      .from("course_mappings")
      .upsert(mappings, { onConflict: "ezygo_id" });

    const { data: currentTrackers } = await supabaseAdmin
      .from("tracker")
      .select("course")
      .eq("auth_user_id", authId);

    const coursesWithTrackers = new Set(currentTrackers?.map(t => String(t.course)) || []);

    for (const m of mappings) {
      const ezygoIdStr = m.ezygo_id;
      if (coursesWithTrackers.has(ezygoIdStr)) {
        await supabaseAdmin
          .from("tracker")
          .update({ course: m.university_code })
          .eq("auth_user_id", authId)
          .eq("course", ezygoIdStr);
      }
    }
  }
}

async function migrateClassCourses(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  classId: string | null,
  oldClassId: string | null | undefined,
  authId: string,
): Promise<void> {
  if (!classId || !oldClassId || oldClassId === classId) return;
  const { error: migrateError } = await supabaseAdmin
    .from("class_courses")
    .update({ class_id: classId })
    .eq("class_id", oldClassId);
  if (migrateError) {
    logger.warn(`[sync] class_courses migration skipped for ${redact("id", authId)}: ${migrateError.message}`);
  }
}

async function detectClassAndPopulateCatalog(
  coursesList: CourseItem[],
  rolesData: unknown,
  authId: string,
) {
  const { classId, classInfo } = await detectAndSyncClass(coursesList, rolesData);
  await populateCourseCatalogAndMigrateTrackers(coursesList, authId);
  return { classId, classInfo };
}

interface ExistingUserData {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  phone_iv?: string | null;
  gender?: string | null;
  gender_iv?: string | null;
  birth_date?: string | null;
  birth_date_iv?: string | null;
  terms_version?: string | null;
  class_id?: string | null;
}

function safeDecryptField(iv: string | null | undefined, content: string | null | undefined): string | null {
  if (!iv || !content) return null;
  try {
    return decrypt({ iv, content });
  } catch {
    return null;
  }
}

function readExistingProfileDecrypted(existingUser: ExistingUserData | null | undefined) {
  if (!existingUser) {
    return { localGender: null, localBirthDate: null, localPhone: null };
  }
  return {
    localGender: safeDecryptField(existingUser.gender_iv, existingUser.gender),
    localBirthDate: safeDecryptField(existingUser.birth_date_iv, existingUser.birth_date),
    localPhone: safeDecryptField(existingUser.phone_iv, existingUser.phone),
  };
}

function resolveMergedProfile(
  existingUser: ExistingUserData | null | undefined,
  ezygoData: EzygoProfileResponse,
) {
  const resolve = (
    local: string | null | undefined,
    remote: string | number | null | undefined,
  ) => {
    if (local && String(local).trim() !== "") return local;
    return remote ? String(remote) : null;
  };

  const { localGender, localBirthDate, localPhone } = readExistingProfileDecrypted(existingUser);

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

  return {
    mergedFirst,
    mergedLast,
    mergedPhone,
    mergedGender,
    mergedBirthDate,
  };
}

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
      throw new Error(`EzyGo Profile failed: ${ezygoRes.status}`);
    }

    const json = await safeResponseJson<{ data?: EzygoProfileResponse } | EzygoProfileResponse>(ezygoRes);
    if (!json) {
      throw new Error(`EzyGo Profile returned empty or invalid JSON: ${ezygoRes.status}`);
    }
    const safeGet = (obj: unknown, prop: string) => obj && typeof obj === "object" ? Reflect.get(obj, prop) : undefined;
    const ezygoData: EzygoProfileResponse = (safeGet(json, "data") ?? json) as EzygoProfileResponse;

    const resolvedEzygoId = (ezygoId && String(ezygoId).trim() !== "")
      ? String(ezygoId)
      : String(ezygoData.user_id || ezygoData.user?.id || "");

    if (!resolvedEzygoId) {
      throw new Error("Missing EzyGo User ID (local and remote)");
    }

    const { coursesMap, coursesList } = await processCoursesData(coursesRes);

    const { ezygoAcademicSemester, ezygoAcademicYear, currentAcademic } = resolveAcademicContext(semRaw, yearRaw);

    triggerAcademicSelfHeal(token, authId, ezygoAcademicSemester, ezygoAcademicYear, currentAcademic);

    const { classId, classInfo } = await detectClassAndPopulateCatalog(coursesList, rolesData, authId);

    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select(
        "first_name, last_name, phone, phone_iv, gender, gender_iv, birth_date, birth_date_iv, terms_version, class_id",
      )
      .or(`id.eq.${resolvedEzygoId},auth_id.eq.${authId}`)
      .maybeSingle();

    // When the stable class ID changes (programme_config_group_id replaces the old
    // semester-scoped usersubgroup.id), forward-migrate class_courses so existing
    // manually-added courses are not orphaned on the old class row.
    // class_courses is class-scoped (not user-scoped): all members of a class share
    // the same rows, so migrating the entire set for the old class UUID to the new one
    // is correct and idempotent — subsequent syncs by other members of the same cohort
    // will find no rows remaining on the old class_id and perform a safe no-op.
    const oldClassId = existingUser?.class_id;
    await migrateClassCourses(supabaseAdmin, classId, oldClassId, authId);

    const { mergedFirst, mergedLast, mergedPhone, mergedGender, mergedBirthDate } = resolveMergedProfile(existingUser, ezygoData);

    const encPhone = mergedPhone ? encrypt(mergedPhone) : null;
    const encGender = mergedGender ? encrypt(mergedGender) : null;
    const encBirthDate = mergedBirthDate ? encrypt(mergedBirthDate) : null;

    const upsertUsername = ezygoData.username ?? ezygoData.user?.username ?? null;
    const upsertEmail = ezygoData.email ?? ezygoData.user?.email ?? null;
    const upsertLastSyncedAt = new Date().toISOString();

    const upsertData = {
      id: resolvedEzygoId,
      auth_id: authId,
      username: upsertUsername,
      email: upsertEmail,
      first_name: mergedFirst,
      last_name: mergedLast,
      phone: encPhone?.content ?? null,
      phone_iv: encPhone?.iv ?? null,
      gender: encGender?.content ?? null,
      gender_iv: encGender?.iv ?? null,
      birth_date: encBirthDate?.content ?? null,
      birth_date_iv: encBirthDate?.iv ?? null,
      last_synced_at: upsertLastSyncedAt,
      ezygo_created_at: safeGet(ezygoData, "created_at") ? String(safeGet(ezygoData, "created_at")) : null,
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
        username: upsertUsername,
        email: upsertEmail,
        phone: mergedPhone,
        gender: mergedGender,
        birthDate: mergedBirthDate,
        lastSyncedAt: upsertLastSyncedAt,
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
  } catch (err) {
    logger.error(`Sync error for ${redact("id", authId)}:`, err);
    Sentry.captureException(err, {
      tags: { type: "sync_failed", component: "sync_service" },
      extra: { ezygoId: redact("id", ezygoId), authId: redact("id", authId) },
    });
    throw err;
  }
}
