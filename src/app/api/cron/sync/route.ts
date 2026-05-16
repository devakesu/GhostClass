import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { normalizeSession, toRoman } from "@/lib/utils";
import { egressFetch, redact } from "@/lib/utils.server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { withSecurity } from "@/lib/security/app-check";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { sendPushNotification } from "@/lib/notifications/push";
import { sendEmail } from "@/lib/email";
import {
  renderAttendanceConflictEmail,
  renderCourseMismatchEmail,
  renderRevisionClassEmail,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;

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
}

interface TrackerItem {
  id: number;
  course: string | number;
  date: string;
  session: string | number;
  attendance: string | number;
  status: string;
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
}

interface CourseMismatchProps {
  username: string;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
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

async function handleAuthentication(req: Request, authType: string): Promise<{ isCron: boolean; errorResponse?: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  const isMobile = authType === "app-check";

  if (authHeader !== null && !isMobile) {
    if (!authHeader.startsWith("Bearer ")) {
      return { isCron: false, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
    }
    const providedSecret = authHeader.slice("Bearer ".length);
    const cronSecret = process.env.CRON_SECRET ?? "";
    const providedBuf = Buffer.from(providedSecret, "utf8");
    const cronBuf = Buffer.from(cronSecret, "utf8");

    if (cronBuf.length > 0 && providedBuf.length === cronBuf.length && crypto.timingSafeEqual(providedBuf, cronBuf)) {
      return { isCron: true };
    }
    return { isCron: false, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  return { isCron: false };
}

async function fetchEzygoResource(path: string, token: string, method: string = "GET", body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await egressFetch(path, {
      method,
      headers: { 
        Authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAndHealToken(
  user: UserSyncData,
  isCron: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>
): Promise<{ token: string; courseRes: Response }> {
  let decryptedToken = decrypt(user.ezygo_iv, user.ezygo_token);
  if (!decryptedToken) throw new Error("Decryption failed");

  let courseRes = await fetchEzygoResource("institutionuser/courses/withusers", decryptedToken);
  
  if (courseRes.status === 401 && !isCron) {
    const cookieToken = await getAuthTokenServer();
    if (cookieToken && cookieToken !== decryptedToken) {
      courseRes = await fetchEzygoResource("institutionuser/courses/withusers", cookieToken);
      if (courseRes.ok) {
        decryptedToken = cookieToken;
        const { iv, content } = encrypt(decryptedToken);
        await supabaseAdmin.from("users").update({ ezygo_token: content, ezygo_iv: iv }).eq("auth_id", user.auth_id);
      }
    }
  }

  return { token: decryptedToken, courseRes };
}

async function fetchOfficialAttendance(token: string): Promise<OfficialAttendanceData> {
  const attRes = await fetchEzygoResource("attendancereports/student/detailed", token, "POST", {});
  if (!attRes.ok) throw new Error(`Attendance API: ${attRes.status}`);
  
  const attData = await attRes.json();
  const officialDataRaw = attData?.studentAttendanceData;
  const normalizedOfficial = Array.isArray(officialDataRaw) && officialDataRaw.length === 0 ? {} : officialDataRaw;
  const officialParse = OfficialAttendanceDataSchema.safeParse(normalizedOfficial);
  if (!officialParse.success) throw new Error("Invalid attendance data shape");

  return officialParse.data;
}

function buildOfficialMap(officialData: OfficialAttendanceData): Map<string, OfficialSlotInfo> {
  const officialMap = new Map<string, OfficialSlotInfo>();
  Object.entries(officialData).forEach(([dateStr, sessionsObj]) => {
    const normDate = dateStr.replace(/-/g, "");
    Object.entries(sessionsObj).forEach(([slotKey, slot], idx) => {
      if (slot.attendance == null || slot.course == null) return;
      
      let rawSession: string | number = slot.session ?? "";
      const isNumericId = (s: unknown) => !isNaN(parseInt(String(s))) && parseInt(String(s)) > 20;
      if (!rawSession || rawSession === "null" || isNumericId(rawSession)) {
        const skNum = parseInt(String(slotKey), 10);
        rawSession = (!isNaN(skNum) && skNum < 20) ? slotKey : String(idx + 1);
      }
      
      const romanSession = toRoman(parseInt(normalizeSession(rawSession)) || String(rawSession));
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
  key: string,
  user: UserSyncData,
  toDelete: Set<number>,
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseMap: Map<string, string>,
  dashboardUrl: string
): void {
  toDelete.add(item.id);
  if (item.status === "extra") {
    notifications.push({
      auth_user_id: user.auth_id,
      title: "Revision Class — Not Counted 📚",
      description: `Manual entry removed as official slot is a Revision class.`,
      topic: `revision-${key}`,
    });
    emails.push({
      type: "revision",
      props: {
        username: user.username,
        courseName: courseMap.get(String(item.course)) || String(item.course),
        date: item.date,
        session: String(item.session),
        dashboardUrl,
      },
    });
  }
}

function handleCourseMismatch(
  item: TrackerItem,
  officialEntry: OfficialSlotInfo,
  key: string,
  user: UserSyncData,
  toDelete: Set<number>,
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseMap: Map<string, string>,
  dashboardUrl: string
): boolean {
  if (item.status === "extra" && String(item.course) !== String(officialEntry.course)) {
    toDelete.add(item.id);
    notifications.push({
      auth_user_id: user.auth_id,
      title: "Course Mismatch 💀",
      description: `Course mismatch on date ${item.date}. Official course differs.`,
      topic: `conflict-course-${key}`,
    });
    emails.push({
      type: "mismatch",
      props: {
        username: user.username,
        date: item.date,
        session: String(item.session),
        manualCourseName: courseMap.get(String(item.course)) || String(item.course),
        courseLabel: courseMap.get(officialEntry.course) || officialEntry.course,
        dashboardUrl,
      },
    });
    return true;
  }
  return false;
}

function getResolvedTitle(officialCode: number, trackerCode: number): string {
  if (officialCode === 225 && trackerCode === 225) return "DL Approved ✅";
  if (trackerCode !== officialCode) return "Surprise Present 🎁";
  return "Attendance Updated 🥳";
}

function handleAttendanceStatus(
  item: TrackerItem,
  officialEntry: OfficialSlotInfo,
  key: string,
  user: UserSyncData,
  stats: SyncStats,
  toDelete: Set<number>,
  toUpdateStatus: number[],
  notifications: NotificationInsert[],
  emails: EmailTask[],
  courseMap: Map<string, string>,
  dashboardUrl: string
): void {
  const officialCode = officialEntry.attendance;
  const trackerCode = Number(item.attendance);
  const isOfficialPositive = officialCode === 110 || officialCode === 225 || officialCode === 112;
  const isTrackerPositive = trackerCode === 110 || trackerCode === 225 || trackerCode === 112;

  if (isOfficialPositive) {
    toDelete.add(item.id);
    notifications.push({
      auth_user_id: user.auth_id,
      title: getResolvedTitle(officialCode, trackerCode),
      description: `Attendance resolved to official status.`,
      topic: `sync-surprise-${key}`,
    });
    return;
  }
  
  if (officialCode === trackerCode) {
    toDelete.add(item.id);
    notifications.push({
      auth_user_id: user.auth_id,
      title: "Attendance Updated 🥳",
      description: `Official record matches manual entry.`,
      topic: `sync-surprise-${key}`,
    });
    return;
  }
  
  if (officialCode === 111 && isTrackerPositive) {
    stats.conflicts++;
    if (item.status === "extra") {
      toUpdateStatus.push(item.id);
      notifications.push({
        auth_user_id: user.auth_id,
        title: "Attendance Conflict 💀",
        description: `Conflict: Marked present but official record is absent.`,
        topic: `conflict-${key}`,
      });
      emails.push({
        type: "conflict",
        props: {
          username: user.username,
          courseLabel: courseMap.get(String(item.course)) || String(item.course),
          date: item.date,
          session: String(item.session),
          dashboardUrl,
        },
      });
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
  courseMap: Map<string, string>,
  dashboardUrl: string
): void {
  const trackerDateKey = item.date.replace(/-/g, "");
  const romanSession = toRoman(parseInt(normalizeSession(item.session)) || String(item.session));
  const key = `${trackerDateKey}|${romanSession}`;

  if (officialEntry.classType === "Revision") {
    handleRevisionClass(item, key, user, toDelete, notifications, emails, courseMap, dashboardUrl);
    return;
  }

  if (handleCourseMismatch(item, officialEntry, key, user, toDelete, notifications, emails, courseMap, dashboardUrl)) {
    return;
  }

  handleAttendanceStatus(item, officialEntry, key, user, stats, toDelete, toUpdateStatus, notifications, emails, courseMap, dashboardUrl);
}

async function executeSyncMutations(
  user: UserSyncData,
  toDelete: Set<number>,
  toUpdateStatus: number[],
  notifications: NotificationInsert[],
  emails: EmailTask[],
  supabaseAdmin: ReturnType<typeof getAdminClient>
): Promise<void> {
  const promises: PromiseLike<unknown>[] = [];
  if (toDelete.size > 0) {
    promises.push(supabaseAdmin.from("tracker").delete().in("id", Array.from(toDelete)));
  }
  if (toUpdateStatus.length > 0) {
    promises.push(supabaseAdmin.from("tracker").update({ status: "correction" }).in("id", toUpdateStatus));
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
      logger.error(`DB error for ${redact("username", user.username)}:`, res.reason);
    } else if (res.value && typeof res.value === "object" && "error" in res.value && (res.value as Record<string, unknown>).error) {
      logger.error(`Supabase error for ${redact("username", user.username)}:`, (res.value as Record<string, unknown>).error);
    } else if (idx === notifIndex) {
      notificationsInserted = true;
    }
  });

  // Execute Async Notifications (Push + Email)
  const notificationPromises: PromiseLike<unknown>[] = [];

  if (notificationsInserted && user.fcm_token) {
    notifications.forEach((n) =>
      notificationPromises.push(
        sendPushNotification({
          token: user.fcm_token!,
          title: n.title,
          body: n.description,
          data: { topic: n.topic },
        })
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
              subject = "Attendance Conflict 💀";
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
          await sendEmail({ to: user.email, subject, html });
        } catch (err) {
          logger.error(`Failed to send sync email to ${redact("email", user.email)}:`, err);
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
  supabaseAdmin: ReturnType<typeof getAdminClient>
): Promise<SyncStats> {
  const stats = createEmptyStats();
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.ghostclass.in'}/dashboard`;

  try {
    const { token, courseRes } = await fetchAndHealToken(user, isCron, supabaseAdmin);
    if (!courseRes.ok) throw new Error(`Courses API: ${courseRes.status}`);
    
    interface EzygoCourse {
      id: number | string;
      name?: string;
      code?: string;
    }
    const courses = (await courseRes.json().catch(() => [])) as EzygoCourse[];
    const courseMap = new Map<string, string>();
    courses.forEach(c => {
      if (c.name) {
        courseMap.set(String(c.id), c.name);
        if (c.code) courseMap.set(String(c.code), c.name);
      }
    });

    await fetchEzygoResource("institutionuser/myroles", token).catch(() => null);

    const officialData = await fetchOfficialAttendance(token);
    stats.processed = 1;

    const { data: trackerData } = await supabaseAdmin
      .from("tracker")
      .select("*")
      .eq("auth_user_id", user.auth_id);
    
    if (!trackerData || trackerData.length === 0) return stats;

    const officialMap = buildOfficialMap(officialData);
    const toDelete = new Set<number>();
    const toUpdateStatus: number[] = [];
    const notifications: NotificationInsert[] = [];
    const emails: EmailTask[] = [];

    const items = trackerData as TrackerItem[];
    items.forEach((item) => {
      const trackerDateKey = item.date.replace(/-/g, "");
      const romanSession = toRoman(parseInt(normalizeSession(item.session)) || String(item.session));
      const officialEntry = officialMap.get(`${trackerDateKey}|${romanSession}`);

      if (officialEntry) {
        processTrackerItem(item, officialEntry, user, stats, toDelete, toUpdateStatus, notifications, emails, courseMap, dashboardUrl);
      }
    });

    await executeSyncMutations(user, toDelete, toUpdateStatus, notifications, emails, supabaseAdmin);

    stats.deletions = toDelete.size;
    stats.updates = toUpdateStatus.length;
    return stats;
  } catch (err) {
    logger.error(`Sync failed for ${redact("username", user.username)} (${redact("id", user.auth_id)})`, err);
    stats.errors = 1;
    return stats;
  } finally {
    await supabaseAdmin.from("users").update({
      last_synced_at: new Date().toISOString(),
    }).eq("auth_id", user.auth_id);
  }
}

export const GET = withSecurity(async (req, { authType }) => {
  const supabaseAdmin = getAdminClient();
  
  const auth = await handleAuthentication(req, authType!);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  let users: UserSyncData[] = [];

  if (auth.isCron) {
    const target = searchParams.get("username");
    let q = supabaseAdmin.from("users").select("*").not("ezygo_token", "is", null);
    if (target) q = q.eq("username", target);
    else q = q.order("last_synced_at", { ascending: true }).limit(BATCH_SIZE);
    const { data } = await q;
    users = data || [];
  } else {
    const supabase = await createClient();
    const authHeader = req.headers.get("authorization");
    const supabaseToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    
    const { data: { user } } = supabaseToken 
      ? await supabase.auth.getUser(supabaseToken)
      : await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data } = await supabaseAdmin.from("users").select("*").eq("auth_id", user.id);
    users = data || [];
  }

  const overallStats = createEmptyStats();
  for (const user of users) {
    const userStats = await syncUser(user, auth.isCron, supabaseAdmin);
    overallStats.processed += userStats.processed;
    overallStats.deletions += userStats.deletions;
    overallStats.updates += userStats.updates;
    overallStats.conflicts += userStats.conflicts;
    overallStats.errors += userStats.errors;
  }

  const successFlag = overallStats.errors === 0;
  return NextResponse.json({ success: successFlag, ...overallStats }, { status: successFlag ? 200 : 500 });
});
