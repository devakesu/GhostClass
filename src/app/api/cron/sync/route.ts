import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server"; 
import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { headers } from "next/headers";
import { syncRateLimiter } from "@/lib/ratelimit";
import { toRoman, normalizeSession } from "@/lib/utils"; 
import { redact, getClientIp } from "@/lib/utils.server";
import { Course } from "@/types";
import { sendEmail } from "@/lib/email";
import type { SendEmailProps } from "@/lib/email";
import { renderAttendanceConflictEmail, renderCourseMismatchEmail, renderRevisionClassEmail } from "@/lib/email-templates";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";

// Insert shape for the `notification` table (server-generated fields omitted).
// Matches the DB schema in supabase/migrations/20260217174834_remote_schema.sql.
interface NotificationInsert {
  auth_user_id: string;
  title: string;
  description: string;
  topic: string;
}

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;
// Keep concurrency low to avoid overwhelming the external EzyGo API.
// Each user sync makes 2 API calls (courses + attendance).
// CONCURRENCY_LIMIT=2 processes 2 users in parallel, limiting peak to 4 concurrent API calls.
const CONCURRENCY_LIMIT = 2;

// Normalize NEXT_PUBLIC_BACKEND_URL once here (trim whitespace, strip trailing
// slashes, then add exactly one) so path concatenation is always correct regardless
// of whether the env value ends with "/" or not. The proxy route does the same via
// BASE_API_URL; keeping the pattern consistent prevents broken URLs in the cron path.
const BACKEND_BASE_URL = `${(process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "") ?? "")}/`;

// Validation schemas
const UsernameSchema = z.string()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username contains invalid characters");

const CourseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  code: z.string().optional(),
});

// EzyGo attendance report schemas — validate the shape of officialData before processing
// so that type changes in the API (e.g. attendance becoming a string) are caught immediately.
const AttendanceSessionSchema = z.object({
  class_type: z.string().nullable().optional(),
  session: z.union([z.string(), z.number()]).nullable().optional(),
  attendance: z.union([z.string(), z.number()]).nullable(),
  course: z.union([z.string(), z.number()]).nullable(),
});

const OfficialAttendanceDataSchema = z.record(
  z.string(),
  z.record(z.string(), AttendanceSessionSchema)
);

// Sync statistics type
interface SyncStats {
  processed: number;
  deletions: number;
  conflicts: number;
  updates: number;
  errors: number;
}

// Create empty stats object
function createEmptyStats(): SyncStats {
  return { processed: 0, deletions: 0, conflicts: 0, updates: 0, errors: 0 };
}

// Aggregate stats from source into target
function aggregateStats(target: SyncStats, source: SyncStats): void {
  target.processed += source.processed;
  target.deletions += source.deletions;
  target.conflicts += source.conflicts;
  target.updates += source.updates;
  target.errors += source.errors;
}

interface UserSyncData {
  username: string;
  email: string;
  ezygo_token: string;
  ezygo_iv: string;
  auth_id: string;
}

export async function GET(req: Request) {
  const supabaseAdmin = getAdminClient();
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    const error = new Error("NEXT_PUBLIC_APP_URL is not set");
    logger.error(error);
    Sentry.captureException(error, { tags: { type: "config_error", location: "cron/sync" } });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const headerList = await headers();

  // Note: This cron endpoint is typically called by non-browser automation (e.g. Vercel Cron, GitHub Actions),
  // so we do not depend on Origin-based validation here. Authentication is handled via CRON_SECRET below.

  // 1. Authenticate FIRST — check CRON_SECRET before rate limiting to fast-reject
  // invalid requests without consuming rate-limit quota. Uses constant-time comparison
  // to prevent timing attacks.
  const authHeader = req.headers.get('authorization');
  let isCron = false;

  if (authHeader !== null) {
    try {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const providedSecret = authHeader.slice('Bearer '.length);
      const cronSecret = process.env.CRON_SECRET ?? '';

      // Convert to Buffers to get exact byte lengths (multi-byte chars would cause
      // timingSafeEqual to throw if we compared JS string lengths instead).
      const providedBuf = Buffer.from(providedSecret, 'utf8');
      const cronBuf = Buffer.from(cronSecret, 'utf8');

      // Constant-time comparison: only proceed if lengths match and bytes are equal
      const isCronValid =
        cronBuf.length > 0 &&
        providedBuf.length === cronBuf.length &&
        crypto.timingSafeEqual(providedBuf, cronBuf);

      if (!isCronValid) {
        // Auth header was present but invalid — reject immediately before rate limiting
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      isCron = true;
    } catch (error) {
      // Malformed header or unexpected comparison error — treat as unauthorized
      Sentry.captureException(error, { level: "warning", tags: { type: "cron_auth_error" } });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  // 2. Rate Limit (applied to the non-cron / user-auth path to prevent abuse)
  const ip = getClientIp(headerList);
  
  if (!isCron) {
    if (!ip) {
      if (process.env.NODE_ENV === "development") {
        // In development, fail fast if we cannot determine the client IP.
        // This avoids masking misconfigurations and ensures IP extraction is exercised before production.
        // Redact IP values to avoid leaking IPs if dev logs are aggregated or NODE_ENV is misconfigured.
        const cfIp = headerList.get("cf-connecting-ip");
        const realIp = headerList.get("x-real-ip");
        logger.warn("Unable to determine client IP in development; failing request to expose configuration issue", {
          headers: {
            "cf-connecting-ip": cfIp ? redact("id", cfIp) : null,
            "x-real-ip": realIp ? redact("id", realIp) : null,
          },
        });
        return NextResponse.json(
          { error: "Development configuration error: unable to determine client IP address" },
          { status: 500 },
        );
      } else {
        // In production, reject requests without a determinable IP to prevent rate limiting bypass
        // Log header presence (boolean) rather than values to avoid IP leakage
        logger.error("Unable to determine client IP for cron request", {
          headers: {
            "cf-connecting-ip": headerList.has("cf-connecting-ip"),
            "x-real-ip": headerList.has("x-real-ip"),
          },
        });
        return NextResponse.json({ error: "Unable to determine client IP address" }, { status: 400 });
      }
    }

    const { success, reset } = await syncRateLimiter.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests", retryAfter: reset },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
  }

  try {
    // 3. Parse query parameters.
    // NOTE: ?username= is only meaningful in the cron path (parsed below inside isCron).
    // It is intentionally not parsed in the non-cron path to avoid dead code and to
    // prevent any future accidental use of caller-supplied username in the user query.
    const { searchParams } = new URL(req.url);

    // 4. Fetch Users
    let usersToSync: UserSyncData[] = [];
    if (isCron) {
        // Parse and validate ?username= here — after cron-secret auth — so the
        // parameter is never reachable by unauthenticated or user-auth callers.
        const targetUsername = searchParams.get('username');
        // Validate username only here — cron secret auth has already been verified above,
        // so returning 400 for a malformed username does not leak information to unauthenticated callers.
        if (targetUsername && !UsernameSchema.safeParse(targetUsername).success) {
          return NextResponse.json({ error: "Invalid username" }, { status: 400 });
        }
        let query = supabaseAdmin.from("users").select("username, email, ezygo_token, ezygo_iv, auth_id").not("ezygo_token", "is", null);
        if (targetUsername) query = query.eq("username", targetUsername);
        else query = query.order("last_synced_at", { ascending: true, nullsFirst: true }).limit(BATCH_SIZE);
        const { data, error } = await query;
        if (error) {
          logger.error("Failed to fetch users for sync:", error);
          Sentry.captureException(error, { tags: { type: "db_query_error", location: "api/cron/sync", auth: "cron" } });
          return NextResponse.json({ error: "Failed to fetch users for sync" }, { status: 500 });
        }
        if (data) usersToSync = data;
    } else {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const { data, error } = await supabaseAdmin.from("users").select("username, email, ezygo_token, ezygo_iv, auth_id").eq("auth_id", user.id).not("ezygo_token", "is", null);
        if (error) {
          logger.error("Failed to fetch users for sync:", error);
          Sentry.captureException(error, { tags: { type: "db_query_error", location: "api/cron/sync", auth: "user" } });
          return NextResponse.json({ error: "Failed to fetch users for sync" }, { status: 500 });
        }
        if (data) usersToSync = data;
    }

    if (usersToSync.length === 0) return NextResponse.json({ success: true, processed: 0 });

    // Audit breadcrumb: record that a cron batch is starting, with redacted user IDs
    if (isCron) {
      Sentry.addBreadcrumb({
        category: "cron",
        message: "Starting cron sync batch",
        level: "info",
        data: {
          batchSize: usersToSync.length,
          userIds: usersToSync.map(u => redact("id", u.auth_id)),
        },
      });
    }

    // ---------------------------------------------------------
    // 5. CHUNKED PARALLEL PROCESSING
    // ---------------------------------------------------------
    const finalResults = createEmptyStats();
    
    // Split users into chunks based on CONCURRENCY_LIMIT
    const chunks = [];
    for (let i = 0; i < usersToSync.length; i += CONCURRENCY_LIMIT) {
        chunks.push(usersToSync.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        // Process users in this chunk concurrently
        const promises = chunk.map(async (user) => {
            // Per-user stats to avoid race conditions
            const userStats = createEmptyStats();
            
            try {
                if (!user.ezygo_token || !user.ezygo_iv || !user.auth_id) throw new Error("Missing credentials");

                const decryptedToken = decrypt(user.ezygo_iv, user.ezygo_token);
                if (!decryptedToken) throw new Error("Decryption failed");

                // A+B. Fetch Courses + Attendance

                // A. Fetch Courses
                // Native fetch used (axios removed) — Next.js 15 / Node 18+ fetch is
                // sufficient and keeps a single HTTP client across the codebase. fetch never
                // throws on HTTP error status, so we check res.ok / res.status explicitly.
                const courseController = new AbortController();
                const courseTimeout = setTimeout(() => courseController.abort(), 8000);
                let courseRes: Response;
                try {
                    courseRes = await fetch(
                        `${BACKEND_BASE_URL}institutionuser/courses/withusers`,
                        { headers: { Authorization: `Bearer ${decryptedToken}` }, signal: courseController.signal }
                    );
                } finally {
                    clearTimeout(courseTimeout);
                }
                if (courseRes.status !== 200) throw new Error(`Courses API failed: ${courseRes.status}`);
                const courseData: unknown = await courseRes.json().catch(() => null);
                if (!courseData) throw new Error(`Courses API failed: empty or invalid JSON`);

                const validatedCourses = (courseData as any[])
                    .map((c: unknown) => CourseSchema.safeParse(c).success ? c : null)
                    .filter(Boolean) as Course[];

                const coursesMap = validatedCourses.reduce((acc, c) => ({ ...acc, [c.id]: c }), {} as Record<string, Course>);

                // B. Fetch Attendance
                const attController = new AbortController();
                const attTimeout = setTimeout(() => attController.abort(), 15000);
                let attRes: Response;
                try {
                    attRes = await fetch(
                        `${BACKEND_BASE_URL}attendancereports/student/detailed`,
                        {
                            method: "POST",
                            headers: { Authorization: `Bearer ${decryptedToken}`, "content-type": "application/json" },
                            body: "{}",
                            signal: attController.signal,
                        }
                    );
                } finally {
                    clearTimeout(attTimeout);
                }
                if (attRes.status !== 200) throw new Error(`Attendance API failed: ${attRes.status}`);
                const attData: unknown = await attRes.json().catch(() => null);
                if (!attData || !(attData as any).studentAttendanceData) throw new Error(`Attendance API failed: missing studentAttendanceData`);
                const rawOfficialData = (attData as any).studentAttendanceData;

                // C. Sync Logic
                const officialDataResult = OfficialAttendanceDataSchema.safeParse(rawOfficialData);
                if (!officialDataResult.success) {
                    throw new Error(`Invalid attendance data from EzyGo API: ${officialDataResult.error.message}`);
                }
                const officialData = officialDataResult.data;
                const { data: trackingData } = await supabaseAdmin
                    .from("tracker")
                    .select("id, course, date, session, attendance, status")
                    .eq("auth_user_id", user.auth_id);

                if (trackingData && trackingData.length > 0) {
                    const officialMap = new Map<string, { code: number, course: string, course_name: string }>();
                    // Keys for slots EzyGo marks as Revision — these don't count toward
                    // attendance, so any manual tracker entry for them should be removed.
                    // Stored separately so Revision slots are distinguishable from missing keys.
                    const revisionKeys = new Set<string>();

                    Object.entries(officialData).forEach(([dateStr, dateObj]) => {
                        Object.entries(dateObj).forEach(([sessionKey, session]) => {
                            // Skip empty/holiday slots where course or attendance is null
                            if (session.course == null || session.attendance == null) return;
                            const rawSession = session.session || sessionKey;
                            const normalizedSession = toRoman(parseInt(normalizeSession(rawSession)) || rawSession);
                            const key = `${dateStr}|${normalizedSession}`;

                            if (session.class_type === "Revision") {
                                // Track but don't add to officialMap — Revision classes
                                // are not counted for attendance.
                                revisionKeys.add(key);
                                return;
                            }

                            officialMap.set(key, { 
                                code: Number(session.attendance),
                                course: String(session.course),
                                course_name: coursesMap[String(session.course)]?.name || String(session.course)
                            });
                        });
                    });

                    // Use Set to prevent duplicate IDs in case the tracker table
                    // ever contains duplicate rows (e.g. from a retried insert). Postgres
                    // treats DELETE ... IN (id, id) as harmless, but deduplication here
                    // keeps userStats.deletions accurate and signals intent clearly.
                    const toDelete = new Set<number>();
                    const toUpdateStatus: number[] = [];
                    const notifications: NotificationInsert[] = [];
                    // Deferred render promises — resolved in parallel after the loop
                    // to avoid awaiting each email render serially inside the for...of.
                    const emailRenderPromises: Promise<SendEmailProps>[] = [];

                    // ─────────────────────────────────────────────────────────────
                    // SYNC DECISION TABLE
                    //
                    // | Condition                                      | Action              | Notified? |
                    // |------------------------------------------------|---------------------|-----------|
                    // Tracker      Official          Action               Notified?
                    // ──────────────────────────────────────────────────────────────────
                    // extra(any)      Revision          Delete               ✅ email+alert
                    // correction(any) Revision          Delete (SILENT)      ❌ (invariant: impossible, defensive guard)
                    // extra(any)      Wrong course      Delete               ✅ email+alert
                    // correction(+)   Positive(+)       Delete               ✅ alert
                    // extra(+)        Positive(+)       Delete               ✅ alert
                    // extra(111)      Absent(111)       Delete               ✅ alert
                    // extra(+)        Absent(111)       Update→correction    ✅ email+alert
                    // correction(+)   Absent(111)       No-op                ❌ (already notified; dispute in tracking page)
                    // any             Key unknown       No-op                ❌ (EzyGo not yet published)
                    // ─────────────────────────────────────────────────────────────

                    for (const item of trackingData) {
                        const normalizedTrackerSession = toRoman(parseInt(normalizeSession(item.session)) || item.session);
                        const key = `${item.date}|${normalizedTrackerSession}`;

                        // Revision class — EzyGo doesn't count this toward attendance.
                        // Always delete the manual entry. Only notify for 'extra' — corrections
                        // can never be revision slots (invariant: corrections are promoted from
                        // extra by this sync and are always tied to a real timetable slot).
                        if (revisionKeys.has(key)) {
                            toDelete.add(item.id);
                            if (item.status === 'extra') {
                                const courseName = coursesMap[String(item.course)]?.name || String(item.course);
                                notifications.push({
                                    auth_user_id: user.auth_id,
                                    title: "Revision Class — Not Counted 📚",
                                    description: `${courseName} - ${item.date} (${item.session}): EzyGo marked this as a Revision class. It won't count toward attendance, so your manual entry was removed.`,
                                    topic: `revision-${key}`
                                });
                                if (user.email) {
                                    emailRenderPromises.push(
                                        renderRevisionClassEmail({
                                            username: user.username,
                                            courseName,
                                            date: item.date,
                                            session: item.session,
                                            dashboardUrl: `${appUrl}/dashboard`
                                        }).then(html => ({
                                            to: user.email!,
                                            subject: `📚 Revision Class: ${courseName}`,
                                            html,
                                        }))
                                    );
                                }
                            }
                            continue;
                        }

                        if (officialMap.has(key)) {
                            const official = officialMap.get(key)!;
                            
                            // Course Mismatch — only for 'extra' entries.
                            // 'correction' entries are promoted from 'extra' by this same sync, so
                            // their course ID is guaranteed to match the official record already.
                            if (item.status === 'extra' && String(item.course) !== official.course) {
                                toDelete.add(item.id);
                                notifications.push({
                                    auth_user_id: user.auth_id,
                                    title: "Course Mismatch 💀",
                                    description: `${item.date} (${item.session}): Removed ${coursesMap[String(item.course)]?.name}. Official: ${official.course_name}`,
                                    topic: `conflict-course-${key}`
                                });

                                if (user.email) {
                                    emailRenderPromises.push(
                                        renderCourseMismatchEmail({
                                            username: user.username,
                                            date: item.date,
                                            session: item.session,
                                            manualCourseName: coursesMap[String(item.course)]?.name || String(item.course),
                                            courseLabel: official.course_name,
                                            dashboardUrl: `${appUrl}/dashboard`
                                        }).then(html => ({
                                            to: user.email!,
                                            subject: `💀 Course Conflict: ${official.course_name}`,
                                            html,
                                        }))
                                    );
                                }
                                continue;
                            }

                            const officialCode = official.code;
                            const trackerCode = Number(item.attendance);
                            const isOfficialPositive = [110, 225, 112].includes(officialCode);
                            const isTrackerPositive = [110, 225, 112].includes(trackerCode);

                            // Sync Logic
                            if (isOfficialPositive) {
                                // Official is positive (present/DL) — entry is resolved, delete it.
                                // Covers all tracker states: correction(+), extra(+), extra(111).
                                // In the correction(+) case this is a "dispute resolved" — EzyGo
                                // has updated to present. In the extra(111) case this is a
                                // "surprise present" — EzyGo now shows attendance the user didn't expect.
                                toDelete.add(item.id);
                                notifications.push({
                                    auth_user_id: user.auth_id,
                                    title: "Attendance Updated 🥳",
                                    description: `${official.course_name} - ${item.date} (${item.session}): Official record is Present. Manual entry removed.`,
                                    topic: `sync-surprise-${key}`
                                });
                            } else if (officialCode === trackerCode) {
                                // Both sides have the same non-positive code (e.g. extra(111) + official(111)).
                                // Manual entry is redundant — delete it.
                                toDelete.add(item.id);
                                notifications.push({
                                    auth_user_id: user.auth_id,
                                    title: "Attendance Updated 🥳",
                                    description: `${official.course_name} - ${item.date} (${item.session}): Official record matches. Manual entry removed.`,
                                    topic: `sync-surprise-${key}`
                                });
                            } else if (officialCode === 111 && isTrackerPositive && item.status === 'extra') {
                                // Official absent + tracker present + new (extra) entry → genuine conflict.
                                // Flip to 'correction' and notify with email.
                                toUpdateStatus.push(item.id);
                                userStats.conflicts++;
                                notifications.push({
                                    auth_user_id: user.auth_id,
                                    title: "Attendance Conflict 💀",
                                    description: `${official.course_name} - ${item.date} (${item.session}): You marked Present, Official says Absent.`,
                                    topic: `conflict-${key}`
                                });
                                
                                if (user.email) {
                                    emailRenderPromises.push(
                                        renderAttendanceConflictEmail({
                                            username: user.username,
                                            courseLabel: official.course_name,
                                            date: item.date,
                                            session: item.session,
                                            dashboardUrl: `${appUrl}/dashboard`
                                        }).then(html => ({
                                            to: user.email!,
                                            subject: `💀 Attendance Conflict: ${official.course_name}`,
                                            html,
                                        }))
                                    );
                                }
                            } else if (officialCode === 111 && isTrackerPositive && item.status === 'correction') {
                                // Official still absent + already in correction state (ongoing dispute).
                                // No alert — the user was already notified when the conflict was first
                                // detected (extra → correction). The tracking page shows pending disputes.
                                // Sending a repeat alert on every sync run would be noise.
                                userStats.conflicts++;
                            }
                        }
                        // Key not in officialMap and not in revisionKeys:
                        // EzyGo has no record for this slot yet — could be a future/pending class.
                        // Cannot make a decision; leave the entry untouched.
                    }

                    // Accumulate stats before parallel flush (sizes are final after the loop)
                    userStats.deletions += toDelete.size;
                    userStats.updates += toUpdateStatus.length;

                    // Resolve all email renders concurrently, then flush all DB writes and
                    // email sends in parallel — these operate on disjoint rows/tables.
                    const renderedEmails = emailRenderPromises.length > 0
                        ? (await Promise.allSettled(emailRenderPromises))
                            .filter((r): r is PromiseFulfilledResult<SendEmailProps> => r.status === 'fulfilled')
                            .map(r => r.value)
                        : [];

                    await Promise.all([
                        toDelete.size > 0
                            ? supabaseAdmin.from("tracker").delete().in("id", [...toDelete])
                            : null,
                        toUpdateStatus.length > 0
                            ? supabaseAdmin.from("tracker").update({ status: 'correction' }).in("id", toUpdateStatus)
                            : null,
                        notifications.length > 0
                            ? supabaseAdmin.from("notification").insert(notifications)
                            : null,
                        renderedEmails.length > 0
                            ? Promise.allSettled(renderedEmails.map(e => sendEmail(e)))
                            : null,
                    ].filter(p => p !== null) as Promise<unknown>[]);
                }

                await supabaseAdmin.from("users").update({ last_synced_at: new Date().toISOString() }).eq("auth_id", user.auth_id);
                userStats.processed++;
                
                return userStats;

            } catch (err: any) {
                // user.username is a student's institutional roll number — log a
                // redacted hash instead of the plaintext value, consistent with the
                // redact() usage on user.auth_id in the Sentry capture below.
                logger.error(`Sync failed for ${redact("id", user.username)}:`, err.message);
                userStats.errors++;

                // CAPTURE INDIVIDUAL USER FAILURES
                Sentry.captureException(err, {
                    tags: { type: "sync_user_failure", location: "cron/sync" },
                    extra: {
                        user_id: redact("id", user.auth_id)
                    }
                });
                
                return userStats;
            }
        });

        // Wait for this chunk to finish and aggregate results
        const results = await Promise.allSettled(promises);
        
        // Aggregate stats from all promises in this chunk
        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
                aggregateStats(finalResults, result.value);
            } else if (result.status === 'rejected') {
                // Ensure rejected user syncs are counted as errors
                finalResults.errors += 1;
                
                // Capture unexpected promise rejections so they are visible
                Sentry.captureException(result.reason, {
                    tags: { type: "sync_user_promise_rejection", location: "cron/sync" },
                });
            }
        });
        
        // Small delay between chunks to respect rate limits (Optional: 1s)
        if (i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Derive overall success and HTTP status from aggregated results
    const totalUsers = usersToSync.length;
    const errorCount = finalResults.errors;

    let statusCode = 200;
    let successFlag = true;

    if (totalUsers > 0 && errorCount > 0) {
      const errorRate = errorCount / totalUsers;

      // All users failed to sync: treat as hard failure
      if (errorRate >= 1) {
        statusCode = 500;
        successFlag = false;
      } else {
        // Partial failure: indicate multi-status
        statusCode = 207;
        successFlag = false;
      }

      // Capture high error rates so they can be monitored/alerted
      Sentry.captureMessage("High error rate in cron/sync", {
        level: "error",
        tags: {
          type: "cron_partial_failure",
          location: "cron/sync",
        },
        extra: {
          totalUsers,
          errorCount,
          errorRate: errorCount / totalUsers,
        },
      });
    }

    return NextResponse.json({ success: successFlag, ...finalResults }, { status: statusCode });
  } catch (error: any) {
    logger.error("Cron Error:", error);
    
    // CAPTURE GLOBAL CRON CRASH
    Sentry.captureException(error, {
        tags: { type: "cron_global_crash", location: "cron/sync" }
    });

    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
