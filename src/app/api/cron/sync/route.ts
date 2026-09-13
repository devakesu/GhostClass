import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { getUserDisplayName, normalizeSession, toRoman, toTitleCase } from "@/lib/utils";
import { egressFetch, redact } from "@/lib/utils.server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { withSecurity } from "@/lib/security/app-check";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { sendPushNotification } from "@/lib/notifications/push";
import { sendEmail } from "@/lib/email";
import { redis } from "@/lib/redis";
import {
  renderAttendanceConflictEmail,
  renderCourseMismatchEmail,
  renderRevisionClassEmail,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const BATCH_SIZE = parseInt(process.env.CRON_SYNC_BATCH_SIZE ?? "25", 10) || 25;

const AttendanceSessionSchema = z.object({
  class_type: z.string().nullable().optional(),
  session: z.union([z.string(), z.number()]).nullable().optional(),
  attendance: z.union([z.string(), z.number()]).nullable(),
  course: z.union([z.string(), z.number()]).nullable(),
});

const OfficialAttendanceDataSchema = z.record(
  z.string(),
  z.record(z.string(), AttendanceSessionSchema),
);

type OfficialAttendanceData = z.infer<typeof OfficialAttendanceDataSchema>;

interface SyncStats {
  processed: number;
  deletions: number;
  conflicts: number;
  updates: number;
  errors: number;
}

interface UserSyncData {
  username: string;
  email: string;
  ezygo_token: string;
  ezygo_iv: string;
  auth_id: string;
  fcm_token?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface TrackerItem {
  id: number;
  course: string | number;
  date: string;
  session: string | number;
  attendance: string | number;
  status: string;
  remarks?: string | null;
}

interface NotificationInsert {
  auth_user_id: string;
  title: string;
  description: string;
  topic: string;
}

interface OfficialSlotInfo {
  attendance: number;
  course: string;
  classType?: string | null;
}

interface AttendanceConflictProps {
  username: string;
  courseLabel: string;
  date: string;
  session: string;
  dashboardUrl: string;
  markedAttendance?: string;
  isDutyLeave?: boolean;
  remarks?: string | null;
}

interface CourseMetadata {
  name?: string;
  code?: string;
}

function formatCourseLabel(
  rawCourse: string | number | undefined,
  courseInfoMap: Map<string, CourseMetadata>,
): string {
  if (!rawCourse) return "Course";
  const str = String(rawCourse).trim();
  const upper = str.toUpperCase();

  const info = courseInfoMap.get(str) || courseInfoMap.get(upper);

  const name = info?.name?.trim();
  const code = info?.code?.trim();

  if (name && code) {
    if (name.toUpperCase() !== code.toUpperCase()) {
      return `${name} (${code.toUpperCase()})`;
    }
    return code.toUpperCase();
  }

  if (name) {
    return name;
  }

  if (code) {
    return code.toUpperCase();
  }

  return str;
}

interface CourseMismatchProps {
  username: string;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
  attendance: string;
  remarks?: string | null;
}

interface RevisionClassProps {
  username: string;
  courseName: string;
  date: string;
  session: string;
  dashboardUrl: string;
}

type EmailTask =
  | { type: "conflict"; props: AttendanceConflictProps }
  | { type: "mismatch"; props: CourseMismatchProps }
  | { type: "revision"; props: RevisionClassProps };

function createEmptyStats(): SyncStats {
  return { processed: 0, deletions: 0, conflicts: 0, updates: 0, errors: 0 };
}

function handleAuthentication(
  req: Request,
  authType: string,
): { isCron: boolean; errorResponse?: NextResponse } {
  const authHeader = req.headers.get("authorization");
  const isMobile = authType === "app-check";

  if (authHeader !== null && !isMobile) {
    if (!authHeader.startsWith("Bearer ")) {
      return {
        isCron: false,
        errorResponse: NextResponse.json({ error: "Unauthorized" }, {
          status: 403,
        }),
      };
    }
    const providedSecret = authHeader.slice("Bearer ".length);
    const cronSecret = process.env.CRON_SECRET ?? "";
    const providedBuf = Buffer.from(providedSecret, "utf8");
    const cronBuf = Buffer.from(cronSecret, "utf8");

    if (
      cronBuf.length > 0 && providedBuf.length === cronBuf.length &&
      crypto.timingSafeEqual(providedBuf, cronBuf)
    ) {
      return { isCron: true };
    }
    // INT-05: If timing-safe comparison against CRON_SECRET fails, do not return 403;
    // fall through so user JWT validation can be attempted.
    return { isCron: false };
  }
  return { isCron: false };
}

async function fetchEzygoResource(
  path: string,
  token: string,
  method: string = "GET",
  body?: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await egressFetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function purgeStaleCronToken(
  user: UserSyncData,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  reason: string,
  err?: unknown,
): Promise<{ expired: true }> {
  logger.warn(
    `[cron/sync] ${reason} for ${redact("username", user.username)} (${
      redact("id", user.auth_id)
    }) — purging stale token`,
    err,
  );
  await supabaseAdmin.from("users").update({
    ezygo_token: null,
    ezygo_iv: null,
    last_synced_at: new Date().toISOString(),
  }).eq("auth_id", user.auth_id);
  return { expired: true };
}

async function resolveDecryptedToken(
  user: UserSyncData,
  isCron: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{ token: string } | { expired: true }> {
  let decryptedToken: string | null = null;
  try {
    decryptedToken = decrypt({
      iv: user.ezygo_iv,
      content: user.ezygo_token,
    });
  } catch (decErr) {
    if (isCron) {
      return purgeStaleCronToken(
        user,
        supabaseAdmin,
        "Token decryption failed",
        decErr,
      );
    }
    throw decErr;
  }

  if (!decryptedToken) {
    if (isCron) {
      return purgeStaleCronToken(
        user,
        supabaseAdmin,
        "Decryption returned empty token",
      );
    }
    throw new Error("Decryption failed");
  }

  return { token: decryptedToken };
}

async function attemptCookieFallback(
  user: UserSyncData,
  currentDecryptedToken: string,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{ token: string; res: Response } | null> {
  const cookieToken = await getAuthTokenServer();
  if (!cookieToken || cookieToken === currentDecryptedToken) return null;

  const res = await fetchEzygoResource(
    "attendancereports/student/detailed",
    cookieToken,
    "POST",
    {},
  );
  if (res.ok) {
    const { iv, content } = encrypt(cookieToken);
    await supabaseAdmin.from("users").update({
      ezygo_token: content,
      ezygo_iv: iv,
    }).eq("auth_id", user.auth_id);
    return { token: cookieToken, res };
  }
  return null;
}

async function getValidTokenAndAttendance(
  user: UserSyncData,
  isCron: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<
  | {
    expired: false;
    token: string;
    officialData: OfficialAttendanceData;
    officialCourses?: Record<string, unknown>;
  }
  | {
    expired: true;
  }
> {
  const tokenResolution = await resolveDecryptedToken(
    user,
    isCron,
    supabaseAdmin,
  );
  if ("expired" in tokenResolution) {
    return tokenResolution;
  }
  let decryptedToken = tokenResolution.token;

  let attRes = await fetchEzygoResource(
    "attendancereports/student/detailed",
    decryptedToken,
    "POST",
    {},
  );

  if (attRes.status === 401) {
    if (isCron) {
      return purgeStaleCronToken(
        user,
        supabaseAdmin,
        "EzyGo token expired (401)",
      );
    }
    const fallback = await attemptCookieFallback(
      user,
      decryptedToken,
      supabaseAdmin,
    );
    if (fallback) {
      decryptedToken = fallback.token;
      attRes = fallback.res;
    }
  }

  if (!attRes.ok) throw new Error(`Attendance API: ${attRes.status}`);

  const attData = await attRes.json();
  const officialDataRaw = attData?.studentAttendanceData;
  const normalizedOfficial =
    Array.isArray(officialDataRaw) && officialDataRaw.length === 0
      ? {}
      : officialDataRaw;
  const officialParse = OfficialAttendanceDataSchema.safeParse(
    normalizedOfficial,
  );
  if (!officialParse.success) throw new Error("Invalid attendance data shape");

  return {
    expired: false,
    token: decryptedToken,
    officialData: officialParse.data,
    officialCourses: attData?.courses,
  };
}

function buildOfficialMap(
  officialData: OfficialAttendanceData,
): Map<string, OfficialSlotInfo> {
  const officialMap = new Map<string, OfficialSlotInfo>();
  Object.entries(officialData).forEach(([dateStr, sessionsObj]) => {
    const normDate = dateStr.replace(/-/g, "");
    Object.entries(sessionsObj).forEach(([slotKey, slot], idx) => {
      if (slot.attendance == null || slot.course == null) return;

      let rawSession: string | number = slot.session ?? "";
      const isNumericId = (s: unknown) =>
        !isNaN(parseInt(String(s))) && parseInt(String(s)) > 20;
      if (!rawSession || rawSession === "null" || isNumericId(rawSession)) {
        const skNum = parseInt(String(slotKey), 10);
        rawSession = (!isNaN(skNum) && skNum < 20) ? slotKey : String(idx + 1);
      }

      const romanSession = toRoman(
        parseInt(normalizeSession(rawSession)) || String(rawSession),
      );
      officialMap.set(`${normDate}|${romanSession}`, {
        attendance: Number(slot.attendance),
        course: String(slot.course),
        classType: slot.class_type,
      });
    });
  });
  return officialMap;
}

function handleRevisionClass(
  item: TrackerItem,
  romanSession: string,
  key: string,
  user: UserSyncData,
  toDelete: Set<number>,
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseInfoMap: Map<string, CourseMetadata>,
  dashboardUrl: string,
): void {
  toDelete.add(item.id);
  if (item.status === "extra") {
    const courseLabel = formatCourseLabel(item.course, courseInfoMap);
    notifications.push({
      auth_user_id: user.auth_id,
      title: "Revision Class — Not Counted 📚",
      description:
        `Manual entry for ${courseLabel} on ${item.date} (Session ${romanSession}) removed as official slot is a Revision class.`,
      topic: `revision-${key}`,
    });
    emails.push({
      type: "revision",
      props: {
        username: getUserDisplayName(user),
        courseName: courseLabel,
        date: item.date,
        session: romanSession,
        dashboardUrl,
      },
    });
  }
}

function handleCourseMismatch(
  item: TrackerItem,
  officialEntry: OfficialSlotInfo,
  romanSession: string,
  key: string,
  user: UserSyncData,
  toDelete: Set<number>,
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseInfoMap: Map<string, CourseMetadata>,
  universityCodeToEzygoId: Map<string, string>,
  dashboardUrl: string,
): boolean {
  if (item.status !== "extra") return false;

  // Resolve the tracker's course value to an EzyGo ID for comparison.
  // Manually-added courses store a university code (e.g. "GAMAT301") while
  // the official EzyGo record uses a numeric ID (e.g. "72323"). We use the
  // reverse lookup map so that matching codes are never flagged as a mismatch.
  const trackerCourseRaw = String(item.course);
  const resolvedTrackerId =
    universityCodeToEzygoId.get(trackerCourseRaw.toUpperCase()) ??
      trackerCourseRaw;

  if (resolvedTrackerId === String(officialEntry.course)) return false;

  toDelete.add(item.id);
  const manualCourseLabel = formatCourseLabel(item.course, courseInfoMap);
  const officialCourseLabel = formatCourseLabel(
    officialEntry.course,
    courseInfoMap,
  );

  const attCodeNum = Number(item.attendance);
  let attendanceLabel = String(item.attendance);
  if (attCodeNum === 110) {
    attendanceLabel = "Present";
  } else if (attCodeNum === 111) {
    attendanceLabel = "Absent";
  } else if (attCodeNum === 225) {
    attendanceLabel = "Duty Leave";
  } else if (attCodeNum === 112) {
    attendanceLabel = "Medically Excused";
  }

  const remarksSuffix = item.remarks?.trim()
    ? ` Your Manual Record Remarks: ${item.remarks.trim()}`
    : "";

  notifications.push({
    auth_user_id: user.auth_id,
    title: "Course Mismatch 💀",
    description:
      `Course mismatch on ${item.date} (Session ${romanSession}). Manual: ${manualCourseLabel}, Official: ${officialCourseLabel}.${remarksSuffix}`,
    topic: `conflict-course-${key}`,
  });
  emails.push({
    type: "mismatch",
    props: {
      username: getUserDisplayName(user),
      date: item.date,
      session: romanSession,
      manualCourseName: manualCourseLabel,
      courseLabel: officialCourseLabel,
      dashboardUrl,
      attendance: attendanceLabel,
      remarks: item.remarks,
    },
  });
  return true;
}

function getResolvedTitle(officialCode: number, trackerCode: number): string {
  if (officialCode === 225 && trackerCode === 225) return "DL Approved ✅";
  if (trackerCode !== officialCode) return "Surprise Present 🎁";
  return "Attendance Updated 🥳";
}

function handleAttendanceStatus(
  item: TrackerItem,
  officialEntry: OfficialSlotInfo,
  romanSession: string,
  key: string,
  user: UserSyncData,
  stats: SyncStats,
  toDelete: Set<number>,
  toUpdateStatus: number[],
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseInfoMap: Map<string, CourseMetadata>,
  dashboardUrl: string,
): void {
  const officialCode = officialEntry.attendance;
  const trackerCode = Number(item.attendance);
  const isOfficialPositive = officialCode === 110 || officialCode === 225 ||
    officialCode === 112;
  const isTrackerPositive = trackerCode === 110 || trackerCode === 225 ||
    trackerCode === 112;
  const courseLabel = formatCourseLabel(item.course, courseInfoMap);

  if (isOfficialPositive) {
    toDelete.add(item.id);
    notifications.push({
      auth_user_id: user.auth_id,
      title: getResolvedTitle(officialCode, trackerCode),
      description:
        `Attendance for ${courseLabel} on ${item.date} (Session ${romanSession}) resolved to official status.`,
      topic: `sync-surprise-${key}`,
    });
    return;
  }

  if (officialCode === trackerCode) {
    toDelete.add(item.id);
    notifications.push({
      auth_user_id: user.auth_id,
      title: "Attendance Updated 🥳",
      description:
        `Official record for ${courseLabel} on ${item.date} (Session ${romanSession}) matches manual entry.`,
      topic: `sync-surprise-${key}`,
    });
    return;
  }

  if (officialCode === 111 && isTrackerPositive) {
    stats.conflicts++;
    if (item.status === "extra") {
      toUpdateStatus.push(item.id);
      const isDL = trackerCode === 225;
      const remarksSuffix = item.remarks?.trim()
        ? ` Your Manual Record Remarks: ${item.remarks.trim()}`
        : "";
      if (isDL) {
        notifications.push({
          auth_user_id: user.auth_id,
          title: "Apply for DL! 📝",
          description:
            `Your extra DL entry for ${courseLabel} on ${item.date} (Session ${romanSession}) is now updated as absent. You can now apply for duty leave.${remarksSuffix}`,
          topic: `conflict-dl-${key}`,
        });
        emails.push({
          type: "conflict",
          props: {
            username: getUserDisplayName(user),
            courseLabel,
            date: item.date,
            session: romanSession,
            dashboardUrl,
            markedAttendance: "Duty Leave",
            isDutyLeave: true,
            remarks: item.remarks,
          },
        });
      } else {
        notifications.push({
          auth_user_id: user.auth_id,
          title: "Attendance Conflict 💀",
          description:
            `Conflict: Marked present for ${courseLabel} on ${item.date} (Session ${romanSession}) but official record is absent.${remarksSuffix}`,
          topic: `conflict-${key}`,
        });
        emails.push({
          type: "conflict",
          props: {
            username: getUserDisplayName(user),
            courseLabel,
            date: item.date,
            session: romanSession,
            dashboardUrl,
            markedAttendance: "Present",
            isDutyLeave: false,
            remarks: item.remarks,
          },
        });
      }
    }
  }
}

function processTrackerItem(
  item: TrackerItem,
  officialEntry: OfficialSlotInfo,
  user: UserSyncData,
  stats: SyncStats,
  toDelete: Set<number>,
  toUpdateStatus: number[],
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseInfoMap: Map<string, CourseMetadata>,
  universityCodeToEzygoId: Map<string, string>,
  dashboardUrl: string,
): void {
  const trackerDateKey = item.date.replace(/-/g, "");
  const romanSession = toRoman(
    parseInt(normalizeSession(item.session)) || String(item.session),
  );
  const key = `${trackerDateKey}|${romanSession}`;

  if (officialEntry.classType === "Revision") {
    handleRevisionClass(
      item,
      romanSession,
      key,
      user,
      toDelete,
      notifications,
      emails,
      courseInfoMap,
      dashboardUrl,
    );
    return;
  }

  if (
    handleCourseMismatch(
      item,
      officialEntry,
      romanSession,
      key,
      user,
      toDelete,
      notifications,
      emails,
      courseInfoMap,
      universityCodeToEzygoId,
      dashboardUrl,
    )
  ) {
    return;
  }

  handleAttendanceStatus(
    item,
    officialEntry,
    romanSession,
    key,
    user,
    stats,
    toDelete,
    toUpdateStatus,
    notifications,
    emails,
    courseInfoMap,
    dashboardUrl,
  );
}

async function executeSyncMutations(
  user: UserSyncData,
  toDelete: Set<number>,
  toUpdateStatus: number[],
  notifications: NotificationInsert[],
  emails: EmailTask[],
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<void> {
  const promises: PromiseLike<unknown>[] = [];
  if (toDelete.size > 0) {
    promises.push(
      supabaseAdmin.from("tracker").delete().in("id", Array.from(toDelete)),
    );
  }
  if (toUpdateStatus.length > 0) {
    promises.push(
      supabaseAdmin.from("tracker").update({ status: "correction" }).in(
        "id",
        toUpdateStatus,
      ),
    );
  }
  let notifIndex = -1;
  if (notifications.length > 0) {
    notifIndex = promises.length;
    promises.push(supabaseAdmin.from("notification").insert(notifications));
  }

  const dbResults = await Promise.allSettled(promises);
  let notificationsInserted = false;

  dbResults.forEach((res, idx) => {
    if (res.status === "rejected") {
      logger.error(
        `DB error for ${redact("username", user.username)}:`,
        res.reason,
      );
    } else if (
      res.value && typeof res.value === "object" && "error" in res.value &&
      (res.value as Record<string, unknown>).error
    ) {
      logger.error(
        `Supabase error for ${redact("username", user.username)}:`,
        (res.value as Record<string, unknown>).error,
      );
    } else if (idx === notifIndex) {
      notificationsInserted = true;
    }
  });

  // Execute Async Notifications (Push + Email)
  const notificationPromises: PromiseLike<unknown>[] = [];

  if (notificationsInserted && user.fcm_token) {
    notifications.forEach((n) =>
      notificationPromises.push(
        (async () => {
          const res = await sendPushNotification({
            token: user.fcm_token!,
            title: n.title,
            body: n.description,
            data: {
              topic: n.topic,
              title: n.title,
              body: n.description,
            },
          });
          if (res.isTerminal && user.auth_id) {
            logger.warn(
              `[cron/sync] Purging terminal FCM registration token for ${redact("username", user.username)}`,
            );
            user.fcm_token = null;
            await supabaseAdmin
              .from("users")
              .update({ fcm_token: null })
              .eq("auth_id", user.auth_id);
          }
        })(),
      )
    );
  }

  if (emails.length > 0) {
    emails.forEach((task) => {
      const emailPromise = (async () => {
        try {
          let html = "";
          let subject = "";
          switch (task.type) {
            case "conflict":
              html = await renderAttendanceConflictEmail(task.props);
              subject = task.props.isDutyLeave
                ? "Apply for DL! 📝"
                : "Attendance Conflict 💀";
              break;
            case "mismatch":
              html = await renderCourseMismatchEmail(task.props);
              subject = "Course Mismatch 💀";
              break;
            case "revision":
              html = await renderRevisionClassEmail(task.props);
              subject = "Revision Class Detected 📚";
              break;
          }
          await sendEmail({
            to: user.email,
            subject,
            html,
            fromName: "GhostClass Alerts",
            toName: getUserDisplayName(user),
          });
        } catch (err) {
          logger.error(
            `Failed to send sync email to ${redact("email", user.email)}:`,
            err,
          );
        }
      })();
      notificationPromises.push(emailPromise);
    });
  }

  if (notificationPromises.length > 0) {
    await Promise.allSettled(notificationPromises);
  }
}

async function syncUser(
  user: UserSyncData,
  isCron: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  courseInfoMap: Map<string, CourseMetadata>,
  universityCodeToEzygoId: Map<string, string>,
): Promise<SyncStats> {
  const stats = createEmptyStats();
  // L-2: NEXT_PUBLIC_APP_URL is required by validate-env.ts; the hardcoded
  // production fallback was removed to prevent staging/preview notification
  // emails linking to the wrong environment.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) {
    logger.warn(
      "[cron/sync] NEXT_PUBLIC_APP_URL is not set — dashboard links in notifications will be broken",
    );
  }
  const dashboardUrl = `${appUrl}/dashboard`;

  try {
    const tokenResult = await getValidTokenAndAttendance(
      user,
      isCron,
      supabaseAdmin,
    );

    if (tokenResult.expired) {
      return stats;
    }

    const { officialData, officialCourses } = tokenResult;
    stats.processed = 1;

    const { data: trackerData } = await supabaseAdmin
      .from("tracker")
      .select("*")
      .eq("auth_user_id", user.auth_id);

    if (!trackerData || trackerData.length === 0) return stats;

    const userCourseInfoMap = new Map(courseInfoMap);
    const userUniversityCodeToEzygoId = new Map(universityCodeToEzygoId);

    if (officialCourses && typeof officialCourses === "object") {
      Object.entries(officialCourses).forEach(([courseId, cVal]) => {
        if (!cVal || typeof cVal !== "object") return;
        const c = cVal as {
          id?: number | string;
          name?: string;
          code?: string;
        };
        const cid = c.id != null ? String(c.id) : String(courseId);
        const code = c.code?.trim().toUpperCase();
        const name = c.name ? toTitleCase(c.name.trim()) : undefined;

        const existing = userCourseInfoMap.get(cid) ||
          (code ? userCourseInfoMap.get(code) : undefined) || {};
        const meta: CourseMetadata = {
          name: name || existing.name,
          code: code || existing.code,
        };

        userCourseInfoMap.set(cid, meta);
        if (code) {
          userCourseInfoMap.set(code, meta);
          userUniversityCodeToEzygoId.set(code, cid);
        }
      });
    }

    const officialMap = buildOfficialMap(officialData);
    const toDelete = new Set<number>();
    const toUpdateStatus: number[] = [];
    const notifications: NotificationInsert[] = [];
    const emails: EmailTask[] = [];

    const items = trackerData as TrackerItem[];
    items.forEach((item) => {
      const trackerDateKey = item.date.replace(/-/g, "");
      const romanSession = toRoman(
        parseInt(normalizeSession(item.session)) || String(item.session),
      );
      const officialEntry = officialMap.get(
        `${trackerDateKey}|${romanSession}`,
      );

      if (officialEntry) {
        processTrackerItem(
          item,
          officialEntry,
          user,
          stats,
          toDelete,
          toUpdateStatus,
          notifications,
          emails,
          userCourseInfoMap,
          userUniversityCodeToEzygoId,
          dashboardUrl,
        );
      }
    });

    await executeSyncMutations(
      user,
      toDelete,
      toUpdateStatus,
      notifications,
      emails,
      supabaseAdmin,
    );

    stats.deletions = toDelete.size;
    stats.updates = toUpdateStatus.length;
    return stats;
  } catch (err) {
    logger.error(
      `Sync failed for ${redact("username", user.username)} (${
        redact("id", user.auth_id)
      })`,
      err,
    );
    stats.errors = 1;
    return stats;
  } finally {
    // H-3: Only update last_synced_at when a sync was actually attempted.
    // Previously this always ran, including on token-expired / decryption-failed
    // paths, which bumped the timestamp and pushed the user to the back of the
    // retry queue — meaning they'd be skipped for the longest possible time
    // instead of being retried promptly.
    if (stats.processed > 0) {
      await supabaseAdmin.from("users").update({
        last_synced_at: new Date().toISOString(),
      }).eq("auth_id", user.auth_id);
    }
  }
}

async function acquireCronLock(
  lockKey: string,
  ttlSec: number,
): Promise<{ acquired: boolean; response?: NextResponse }> {
  try {
    const lockResult = await redis.set(lockKey, "locked", {
      nx: true,
      ex: ttlSec,
    });
    if (!lockResult) {
      logger.info(
        "[cron/sync] Another sync job is currently running. Skipping duplicate run.",
      );
      return {
        acquired: false,
        response: NextResponse.json(
          {
            success: true,
            skipped: true,
            message: "Sync job already in progress",
          },
          { status: 200 },
        ),
      };
    }
    return { acquired: true };
  } catch (lockErr) {
    logger.warn(
      "[cron/sync] Failed to check/acquire distributed lock in Redis:",
      lockErr,
    );
    return { acquired: false };
  }
}

async function fetchCronUsers(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  target: string | null,
): Promise<UserSyncData[]> {
  let q = supabaseAdmin.from("users")
    .select(
      "username, email, ezygo_token, ezygo_iv, auth_id, fcm_token, first_name, last_name",
    )
    .not("ezygo_token", "is", null);
  if (target) q = q.eq("username", target);
  else q = q.order("last_synced_at", { ascending: true }).limit(BATCH_SIZE);
  const { data } = await q;
  const users: UserSyncData[] = data || [];

  if (users.length > 0 && !target) {
    const userAuthIds = users.map((u) => u.auth_id).filter(Boolean);
    if (userAuthIds.length > 0) {
      await supabaseAdmin
        .from("users")
        .update({ last_synced_at: new Date().toISOString() })
        .in("auth_id", userAuthIds);
    }
  }
  return users;
}

async function fetchSessionUser(
  req: Request,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{ users?: UserSyncData[]; errorResponse?: NextResponse }> {
  const supabase = await createClient();
  const authHeader = req.headers.get("authorization");
  const supabaseToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  const { data: { user } } = supabaseToken
    ? await supabase.auth.getUser(supabaseToken)
    : await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized" }, {
        status: 401,
      }),
    };
  }
  const { data } = await supabaseAdmin.from("users")
    .select(
      "username, email, ezygo_token, ezygo_iv, auth_id, fcm_token, first_name, last_name",
    )
    .eq("auth_id", user.id);
  return { users: data || [] };
}

async function loadCourseMaps(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{
  courseInfoMap: Map<string, CourseMetadata>;
  universityCodeToEzygoId: Map<string, string>;
}> {
  const { data: mappings } = await supabaseAdmin.from("course_mappings").select(
    "ezygo_id, course_name, university_code",
  );
  const courseInfoMap = new Map<string, CourseMetadata>();
  const universityCodeToEzygoId = new Map<string, string>();
  if (mappings) {
    mappings.forEach((m) => {
      const name = m.course_name
        ? toTitleCase(m.course_name.trim())
        : undefined;
      const code = m.university_code?.trim().toUpperCase();
      const meta: CourseMetadata = { name, code };

      if (m.ezygo_id != null) {
        courseInfoMap.set(String(m.ezygo_id), meta);
      }
      if (code) {
        courseInfoMap.set(code, meta);
        if (m.ezygo_id != null) {
          universityCodeToEzygoId.set(code, String(m.ezygo_id));
        }
      }
    });
  }
  return { courseInfoMap, universityCodeToEzygoId };
}

export const GET = withSecurity(async (req, { authType }) => {
  const supabaseAdmin = getAdminClient();

  const auth = handleAuthentication(req, authType!);
  if (auth.errorResponse) return auth.errorResponse;

  const LOCK_KEY = "cron:sync:lock";
  const LOCK_TTL_SEC = 120;
  let lockAcquired = false;

  if (auth.isCron) {
    const lock = await acquireCronLock(LOCK_KEY, LOCK_TTL_SEC);
    if (lock.response) return lock.response;
    lockAcquired = lock.acquired;
  }

  try {
    const { searchParams } = new URL(req.url);
    let users: UserSyncData[] = [];

    if (auth.isCron) {
      users = await fetchCronUsers(supabaseAdmin, searchParams.get("username"));
    } else {
      const sessionResult = await fetchSessionUser(req, supabaseAdmin);
      if (sessionResult.errorResponse) return sessionResult.errorResponse;
      users = sessionResult.users || [];
    }

    const { courseInfoMap, universityCodeToEzygoId } = await loadCourseMaps(
      supabaseAdmin,
    );

    const overallStats = createEmptyStats();
    // L-3: Process users concurrently instead of sequentially.
    // With BATCH_SIZE=10 and 1-2 EzyGo API calls + DB writes per user,
    // sequential processing takes 30-60 s per cron run. Parallel execution
    // keeps this well within serverless and Docker health-check timeouts.
    const userResults = await Promise.all(
      users.map((user) =>
        syncUser(
          user,
          auth.isCron,
          supabaseAdmin,
          courseInfoMap,
          universityCodeToEzygoId,
        )
      ),
    );
    for (const userStats of userResults) {
      overallStats.processed += userStats.processed;
      overallStats.deletions += userStats.deletions;
      overallStats.updates += userStats.updates;
      overallStats.conflicts += userStats.conflicts;
      overallStats.errors += userStats.errors;
    }

    const isBatchCron = auth.isCron && !searchParams.get("username");
    // In batch cron mode, consider the run successful if at least one user processed
    // or if there were no errors at all. Only fail the whole batch with 500 if every user errored.
    const successFlag = isBatchCron
      ? (overallStats.processed > 0 || overallStats.errors === 0)
      : overallStats.errors === 0;
    return NextResponse.json({ success: successFlag, ...overallStats }, {
      status: successFlag ? 200 : 500,
    });
  } finally {
    if (lockAcquired) {
      try {
        await redis.del(LOCK_KEY);
      } catch (err) {
        logger.warn("[cron/sync] Failed to release distributed lock:", err);
      }
    }
  }
});
