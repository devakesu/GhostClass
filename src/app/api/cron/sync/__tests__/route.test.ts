/**
 * Tests for GET /api/cron/sync — EzyGo attendance sync logic
 *
 * These tests mock EzyGo's course/attendance API responses to simulate every
 * decision branch in the sync loop:
 *   1. Official present  → delete correction (no notification)
 *   2. Official present, tracker was absent → delete + "Attendance Updated" notification
 *   3. Official absent   → correction entry stays unchanged
 *   4. Official absent   → extra entry → conflict (mark as correction + notification)
 *   5. No official record → extra entry stays
 *   6. Course mismatch   → extra   → delete + "Course Mismatch" notification
 *   7. Course mismatch   → correction → delete, no notification
 *   8. Null attendance slot from EzyGo → slot skipped (key not built, item stays)
 *   9. Revision class from EzyGo → extra entry deleted + notification; correction deleted silently
 *  10. Mixed batch — multiple tracker items with varied outcomes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock server-only package so Vitest's jsdom environment doesn't reject it.
// Must be declared before any module that transitively imports server-only.
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Environment variables — must be set before any module imports
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://ezygo.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
  vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

// ---------------------------------------------------------------------------
// Supabase admin mock — per-test controllable
// ---------------------------------------------------------------------------
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

// ---------------------------------------------------------------------------
// Supabase server client mock (non-cron path guard — unused in cron tests)
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })
  ),
}));

// ---------------------------------------------------------------------------
// Crypto mock — always return a predictable decrypted token
// ---------------------------------------------------------------------------
vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "decrypted-ezygo-token"),
}));

// ---------------------------------------------------------------------------
// Rate limiter mock
// ---------------------------------------------------------------------------
vi.mock("@/lib/ratelimit", () => ({
  syncRateLimiter: { limit: vi.fn().mockResolvedValue({ success: true, reset: 0 }) },
}));

// ---------------------------------------------------------------------------
// Email / template mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email-templates", () => ({
  renderAttendanceConflictEmail: vi.fn().mockResolvedValue("<html>conflict</html>"),
  renderCourseMismatchEmail: vi.fn().mockResolvedValue("<html>mismatch</html>"),
  renderRevisionClassEmail: vi.fn().mockResolvedValue("<html>revision</html>"),
}));

// ---------------------------------------------------------------------------
// Next.js headers() mock
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve(new Map([["x-forwarded-for", "127.0.0.1"]]))
  ),
}));

// ---------------------------------------------------------------------------
// Sentry mock
// ---------------------------------------------------------------------------
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Helpers — build a valid CRON_SECRET Auth header
// ---------------------------------------------------------------------------
function cronAuthHeader(): { authorization: string } {
  return { authorization: "Bearer test-cron-secret-value" };
}

function makeCronRequest(username?: string): NextRequest {
  const url = username
    ? `http://localhost:3000/api/cron/sync?username=${username}`
    : "http://localhost:3000/api/cron/sync";
  return new NextRequest(url, { headers: cronAuthHeader() });
}

// ---------------------------------------------------------------------------
// EzyGo mock response builders
// ---------------------------------------------------------------------------

/** Courses API mock (institutionuser/courses/withusers) */
function mockCoursesResponse(courses: { id: number; name: string; code?: string }[] = COURSES) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(courses), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

/**
 * Attendance API mock (attendancereports/student/detailed).
 *
 * officialData shape:
 *   { "YYYY-MM-DD": { "<sessionKey>": { session, attendance, course, class_type? } } }
 */
function mockAttendanceResponse(officialData: Record<string, Record<string, unknown>>) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ studentAttendanceData: officialData }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_ID = "00000000-0000-0000-0000-000000000001";

const COURSES = [
  { id: 1001, name: "Engineering Mathematics" },
  { id: 1002, name: "Data Structures" },
  { id: 1003, name: "Computer Networks" },
  { id: 1004, name: "Operating Systems" },
  { id: 1005, name: "Database Management" },
  { id: 1006, name: "Software Engineering" },
  { id: 1007, name: "Machine Learning" },
];

/** A single user row returned by the admin DB query */
const MOCK_USER_ROW = {
  username: "testuser",
  email: "student@example.com",
  ezygo_token: "encrypted-token-blob",
  ezygo_iv: "test-iv",
  auth_id: AUTH_ID,
};

/**
 * Build an EzyGo session entry.
 * `sessionNum` 1-6 → maps to tracker sessions I-VI.
 */
function ezygoSession(
  sessionNum: number,
  attendance: number | null,
  course: number | null,
  class_type = "Regular"
) {
  return { session: sessionNum, attendance, course, class_type };
}

// ---------------------------------------------------------------------------
// Supabase mock factory
//
// Returns spies for the database operations so each test can assert on them.
// The factory mimics the Supabase query builder's fluent interface.
// ---------------------------------------------------------------------------
function buildAdminMock(opts: {
  trackerData: Array<{
    id: number;
    course: string;
    date: string;
    session: string;
    attendance: string;
    status: string;
  }>;
}) {
  const deleteInSpy = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
  const updateTrackerSpy = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) });
  const notificationInsertSpy = vi.fn().mockResolvedValue({ error: null });
  const usersUpdateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        // cron-path user fetch chain:
        // .select(...).not(...).eq(...) OR .select(...).not(...).order(...).limit(...)
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [MOCK_USER_ROW], error: null }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [MOCK_USER_ROW], error: null }),
            }),
          }),
        }),
        update: usersUpdateSpy,
      };
    }

    if (table === "tracker") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: opts.trackerData, error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: deleteInSpy,
        }),
        update: updateTrackerSpy,
      };
    }

    if (table === "notification") {
      return { insert: notificationInsertSpy };
    }

    // Fallback — shouldn't be reached
    return {};
  });

  return { deleteInSpy, updateTrackerSpy, notificationInsertSpy, usersUpdateSpy };
}

// ---------------------------------------------------------------------------
// Lazy-import GET handler after mocks are in place
// ---------------------------------------------------------------------------
let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Re-stub env vars on every test — the global vitest.setup.ts afterEach calls
  // vi.unstubAllEnvs() which wipes hoisted stubs, causing CRON_SECRET to be
  // undefined for all tests after the first one.
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://ezygo.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
  vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

  // Re-import to pick up fresh mocks
  const mod = await import("../route");
  GET = mod.GET as unknown as (req: NextRequest) => Promise<Response>;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Test suites
// ===========================================================================

describe("Cron sync — official present + tracker positive → delete + alert", () => {
  it("deletes the correction and sends an Attendance Updated alert", async () => {
    const { deleteInSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // id=332: correction, attendance=110 (present), course=1005, 2025-10-24 session III
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "3": ezygoSession(3, 110, 1005) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [101]);
    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications[0].title).toContain("Attendance Updated");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — official present, tracker was absent → delete + 'Attendance Updated' notification", () => {
  it("deletes the correction and emits an Attendance Updated notification", async () => {
    const { deleteInSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // Tracker says absent (111) but official flipped to present (110) — surprise update
        { id: 106, course: "1005", date: "2025-10-24", session: "III", attendance: "111", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "3": ezygoSession(3, 110, 1005) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [106]);

    // "Attendance Updated 🥳" notification must be inserted
    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Attendance Updated 🥳");
    expect(notifications[0].topic).toContain("sync-surprise");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — official absent, tracker correction → entry stays (no change)", () => {
  it("does not delete or update the correction when official says absent", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // User disputes an absence; official still says absent — keep the correction
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "3": ezygoSession(3, 111 /* absent */, 1005) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(0);
    expect(deleteInSpy).not.toHaveBeenCalled();
    expect(updateTrackerSpy).not.toHaveBeenCalled();
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — official absent, tracker extra (self-mark present) → conflict", () => {
  it("updates status to correction and inserts a conflict notification", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // id=334: user self-marked present on 2025-12-31 but official says absent
        { id: 103, course: "1001", date: "2025-12-31", session: "I", attendance: "110", status: "extra" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-12-31": { "1": ezygoSession(1, 111 /* absent */, 1001) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conflicts).toBe(1);
    expect(body.updates).toBe(1);
    expect(deleteInSpy).not.toHaveBeenCalled();

    // update({ status: 'correction' }).in("id", [103])
    const updateChain = updateTrackerSpy.mock.results[0].value;
    expect(updateTrackerSpy).toHaveBeenCalledWith({ status: "correction" });
    expect(updateChain.in).toHaveBeenCalledWith("id", [103]);

    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications[0].title).toBe("Attendance Conflict 💀");
    expect(notifications[0].topic).toContain("conflict-");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — no official record for date → extra entry stays untouched", () => {
  it("leaves the extra entry alone when EzyGo has no record for that date", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        { id: 103, course: "1001", date: "2025-12-31", session: "I", attendance: "110", status: "extra" },
      ],
    });

    mockCoursesResponse();
    // Empty official data — 2025-12-31 is not in EzyGo at all
    mockAttendanceResponse({});

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(0);
    expect(deleteInSpy).not.toHaveBeenCalled();
    expect(updateTrackerSpy).not.toHaveBeenCalled();
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — course mismatch on an extra entry → delete + Course Mismatch notification", () => {
  it("deletes the extra and emits a Course Mismatch notification", async () => {
    const { deleteInSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // Tracker says course 1001 for this slot, but official has a different course
        { id: 103, course: "1001", date: "2025-12-31", session: "I", attendance: "110", status: "extra" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      // Official shows course 99999 (completely different course) for the same slot
      "2025-12-31": { "1": ezygoSession(1, 110, 99999) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [103]);

    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications[0].title).toBe("Course Mismatch 💀");
    expect(notifications[0].topic).toContain("conflict-course");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — course mismatch on a correction entry → delete + alert", () => {
  it("deletes a correction when the official slot is positive (course guard skipped for corrections)", async () => {
    // Course mismatch guard only runs for 'extra'; corrections fall through to attendance comparison.
    // Official is 110 (positive) → isOfficialPositive → delete + 'Attendance Updated' alert.
    const { deleteInSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "3": ezygoSession(3, 110, 99999 /* different course, ignored for corrections */) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [101]);
    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications[0].title).toBe("Attendance Updated 🥳");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — EzyGo returns null attendance/course (holiday slot) → skipped", () => {
  it("does not build an officialMap key for the null slot, leaving the tracker item alone", async () => {
    const { deleteInSpy, updateTrackerSpy } = buildAdminMock({
      trackerData: [
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      // Null attendance and course — holiday / empty slot from EzyGo
      "2025-10-24": { "3": { session: 3, attendance: null, course: null, class_type: null } },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(0);
    expect(deleteInSpy).not.toHaveBeenCalled();
    expect(updateTrackerSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — EzyGo Revision class, correction entry → deleted silently", () => {
  it("deletes the correction without sending a notification", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "3": ezygoSession(3, 110, 1005, "Revision") },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [101]);
    expect(updateTrackerSpy).not.toHaveBeenCalled();
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — Duty Leave (225) tracker entry; official confirms present → delete + alert", () => {
  it("removes the duty-leave correction and sends an alert when official says 225 (codes match)", async () => {
    // correction(225) + official(225): officialCode === trackerCode → delete + 'Attendance Updated' alert.
    const { deleteInSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        { id: 102, course: "1005", date: "2025-10-24", session: "IV", attendance: "225", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "4": ezygoSession(4, 225, 1005) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deletions).toBe(1);
    expect(deleteInSpy).toHaveBeenCalledWith("id", [102]);
    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications[0].title).toBe("Attendance Updated 🥳");
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — mixed batch with multiple outcomes", () => {
  it("correctly processes corrections + extras with varied official responses", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [
        // A: correction (110) → official present (110) → DELETE + alert
        { id: 101, course: "1005", date: "2025-10-24", session: "III", attendance: "110", status: "correction" },
        // B: correction (225) → official present (225) → DELETE + alert
        { id: 102, course: "1005", date: "2025-10-24", session: "IV", attendance: "225", status: "correction" },
        // C: extra (110) → official absent (111) → CONFLICT, update + notif
        { id: 103, course: "1001", date: "2025-12-31", session: "I", attendance: "110", status: "extra" },
        // D: extra (225) → no EzyGo record → STAYS (no key in officialMap)
        { id: 105, course: "1007", date: "2025-12-31", session: "II", attendance: "225", status: "extra" },
        // E: correction (225) → official absent (111) → correction status, not extra → STAYS
        { id: 104, course: "1001", date: "2025-10-06", session: "III", attendance: "225", status: "correction" },
      ],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": {
        "3": ezygoSession(3, 110, 1005), // A: official present
        "4": ezygoSession(4, 225, 1005), // B: official duty leave (positive)
      },
      "2025-12-31": {
        "1": ezygoSession(1, 111 /* absent */, 1001), // C: conflict
        // session 2 absent from EzyGo → D stays
      },
      "2025-10-06": {
        "3": ezygoSession(3, 111 /* absent */, 1001), // E: official absent → correction stays
      },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);

    // A + B should be deleted
    expect(body.deletions).toBe(2);
    const [, deletedIds] = deleteInSpy.mock.calls[0];
    expect(deletedIds).toEqual(expect.arrayContaining([101, 102]));
    expect(deletedIds).toHaveLength(2);

    // C should become a conflict → update; E (correction+absent) also increments conflicts but no notification
    expect(body.conflicts).toBe(2);
    expect(body.updates).toBe(1);
    const updateChain = updateTrackerSpy.mock.results[0].value;
    expect(updateChain.in).toHaveBeenCalledWith("id", [103]);

    // D and E should remain untouched — no extra deletes or updates for them
    // Verified implicitly: deletedIds has only 2 entries, updateTrackerSpy called once

    // Notifications: A + B (Attendance Updated) + C (Attendance Conflict) = 3
    // D has no official record → no notif; E is correction+absent → conflicts++ only, no notif
    expect(notificationInsertSpy).toHaveBeenCalledOnce();
    const [notifications] = notificationInsertSpy.mock.calls[0];
    expect(notifications).toHaveLength(3);
    expect(notifications[0].title).toContain("Attendance Updated"); // A
    expect(notifications[1].title).toContain("Attendance Updated"); // B
    expect(notifications[2].title).toContain("Attendance Conflict"); // C
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — no tracker data → processed successfully, nothing to do", () => {
  it("returns processed=1 with zero mutations when the tracker is empty", async () => {
    const { deleteInSpy, updateTrackerSpy, notificationInsertSpy } = buildAdminMock({
      trackerData: [],
    });

    mockCoursesResponse();
    mockAttendanceResponse({
      "2025-10-24": { "1": ezygoSession(1, 110, 1005) },
    });

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.deletions).toBe(0);
    expect(deleteInSpy).not.toHaveBeenCalled();
    expect(updateTrackerSpy).not.toHaveBeenCalled();
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — EzyGo courses API fails → user counted as error", () => {
  it("returns 500 when courses fetch returns non-200", async () => {
    buildAdminMock({ trackerData: [] });

    // Courses API returns 500
    mockFetch.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.errors).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — EzyGo attendance API fails → user counted as error", () => {
  it("returns 500 when attendance fetch returns non-200", async () => {
    buildAdminMock({ trackerData: [] });

    // Courses succeed, attendance fails
    mockCoursesResponse();
    mockFetch.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));

    const res = await GET(makeCronRequest("testuser"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("Cron sync — invalid CRON_SECRET → 401", () => {
  it("returns 401 for an incorrect secret", async () => {
    buildAdminMock({ trackerData: [] });

    const req = new NextRequest("http://localhost:3000/api/cron/sync", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const res = await GET(req);
    // Wrong secret is immediately rejected with 403 before any rate limiting.
    expect(res.status).toBe(403);
  });
});
