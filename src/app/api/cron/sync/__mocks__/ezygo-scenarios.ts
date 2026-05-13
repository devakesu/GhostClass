/**
 * Dev-only EzyGo API mock scenarios for the cron/sync route.
 *
 * Activate by appending `?mock=<scenario>` to the cron URL, e.g.:
 *   GET /api/cron/sync?mock=confirmed
 *   GET /api/cron/sync?mock=all_absent
 *
 * Only active when NODE_ENV === 'development'. In production this module
 * is never imported (the import is guarded in route.ts).
 *
 * Each scenario returns two mock Response objects that replace the real
 * EzyGo fetch calls:
 *   - courses: institutionuser/courses/withusers
 *   - attendance: attendancereports/student/detailed
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REAL TRACKER DATA (DB fixture for user d56764bd-cdad-4106-ae24-8a0121bb777d)
 *
 *  id  | course | date       | session | att | status
 * -----|--------|------------|---------|-----|----------
 *  332 | 72327  | 2025-10-24 | III (3) | 110 | correction
 *  333 | 72327  | 2025-10-24 | IV  (4) | 225 | correction
 *  334 | 72323  | 2025-12-31 | I   (1) | 110 | extra
 *  335 | 72326  | 2025-10-24 | VI  (6) | 225 | correction
 *  336 | 72325  | 2025-10-06 | VI  (6) | 225 | correction
 *  338 | 72329  | 2025-10-06 | IV  (4) | 225 | correction
 *  339 | 72323  | 2025-10-06 | III (3) | 225 | correction
 *  340 | 72328  | 2025-10-06 | II  (2) | 225 | correction
 *  341 | 72324  | 2025-10-06 | I   (1) | 225 | correction
 *  342 | 72326  | 2025-09-25 | IV  (4) | 225 | correction
 *  343 | 72324  | 2025-09-25 | II  (2) | 225 | correction
 *  345 | 72328  | 2025-10-24 | I   (1) | 225 | correction
 *  348 | 72324  | 2025-11-06 | II  (2) | 225 | correction
 *  349 | 72329  | 2025-11-06 | IV  (4) | 225 | correction
 *  351 | 72323  | 2025-11-03 | III (3) | 225 | correction
 *  352 | 72329  | 2025-12-31 | II  (2) | 225 | extra
 *  354 | 72327  | 2025-12-31 | III (3) | 225 | extra
 *  355 | 72327  | 2025-12-31 | IV  (4) | 225 | extra
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Attendance codes:
 *   110 = Present   112 = Medically Excused   225 = Duty Leave  (all "positive")
 *   111 = Absent
 */



// ---------------------------------------------------------------------------
// Static courses — same for every scenario
// ---------------------------------------------------------------------------
const MOCK_COURSES = [
  { id: 72323, name: "Engineering Mathematics", code: "MA101" },
  { id: 72324, name: "Data Structures", code: "CS201" },
  { id: 72325, name: "Computer Networks", code: "CS301" },
  { id: 72326, name: "Operating Systems", code: "CS302" },
  { id: 72327, name: "Database Management", code: "CS303" },
  { id: 72328, name: "Software Engineering", code: "CS401" },
  { id: 72329, name: "Machine Learning", code: "CS402" },
];

/** Helper to build an EzyGo attendance session entry. */
function slot(
  session: number,
  attendance: number | null,
  course: number | null,
  class_type = "Regular",
): Record<string, number | string | null> {
  return { session, attendance, course, class_type };
}

/** Session key → string for the outer date record. */
function k(n: number): string {
  return String(n);
}

/** Type for attendance data structure: {date -> {sessionNum -> slot}} */
type AttendanceData = Record<string, Record<string, Record<string, number | string | null>>>;

// ---------------------------------------------------------------------------
// SCENARIO DATA
// Each key is a { "YYYY-MM-DD": { "<num>": slot(...) } } attendance dataset.
// ---------------------------------------------------------------------------

/**
 * `confirmed` — EzyGo confirms every tracker entry with the same attendance
 * code and course ID.
 *
 * Expected outcome:
 *   • All 18 tracker entries deleted
 *   • 0 notifications (official positive + tracker positive → no "Attendance Updated" notification)
 */
const CONFIRMED: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 72327), // 332 — correction, att=110 → official=110 → delete
    [k(4)]: slot(4, 225, 72327), // 333 — correction, att=225 → official=225 → delete
    [k(6)]: slot(6, 225, 72326), // 335 — correction, att=225 → delete
    [k(1)]: slot(1, 225, 72328), // 345 — correction, att=225 → delete
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 72325), // 336 — correction → delete
    [k(4)]: slot(4, 225, 72329), // 338 — correction → delete
    [k(3)]: slot(3, 225, 72323), // 339 — correction → delete
    [k(2)]: slot(2, 225, 72328), // 340 — correction → delete
    [k(1)]: slot(1, 225, 72324), // 341 — correction → delete
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 72326), // 342 — correction → delete
    [k(2)]: slot(2, 225, 72324), // 343 — correction → delete
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 72324), // 348 — correction → delete
    [k(4)]: slot(4, 225, 72329), // 349 — correction → delete
  },
  "2025-11-03": {
    [k(3)]: slot(3, 225, 72323), // 351 — correction → delete
  },
  "2025-12-31": {
    [k(1)]: slot(1, 110, 72323), // 334 — extra, att=110 → official=110 → delete (no notif: tracker also positive)
    [k(2)]: slot(2, 225, 72329), // 352 — extra, att=225 → official=225 → delete
    [k(3)]: slot(3, 225, 72327), // 354 — extra, att=225 → official=225 → delete
    [k(4)]: slot(4, 225, 72327), // 355 — extra, att=225 → official=225 → delete
  },
};

/**
 * `all_absent` — EzyGo reports absent (111) for every tracked slot.
 *
 * Expected outcome:
 *   • 14 corrections stay (official absent + correction status → no action)
 *   • 4 extras conflict (334, 352, 354, 355) → 4 updates, 4 "Attendance Conflict 💀" notifications
 */
const ALL_ABSENT: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 111, 72327), // 332 — correction → stays
    [k(4)]: slot(4, 111, 72327), // 333 — correction → stays
    [k(6)]: slot(6, 111, 72326), // 335 — correction → stays
    [k(1)]: slot(1, 111, 72328), // 345 — correction → stays
  },
  "2025-10-06": {
    [k(6)]: slot(6, 111, 72325), // 336 — correction → stays
    [k(4)]: slot(4, 111, 72329), // 338 — correction → stays
    [k(3)]: slot(3, 111, 72323), // 339 — correction → stays
    [k(2)]: slot(2, 111, 72328), // 340 — correction → stays
    [k(1)]: slot(1, 111, 72324), // 341 — correction → stays
  },
  "2025-09-25": {
    [k(4)]: slot(4, 111, 72326), // 342 — correction → stays
    [k(2)]: slot(2, 111, 72324), // 343 — correction → stays
  },
  "2025-11-06": {
    [k(2)]: slot(2, 111, 72324), // 348 — correction → stays
    [k(4)]: slot(4, 111, 72329), // 349 — correction → stays
  },
  "2025-11-03": {
    [k(3)]: slot(3, 111, 72323), // 351 — correction → stays
  },
  "2025-12-31": {
    [k(1)]: slot(1, 111, 72323), // 334 — extra, att=110 → conflict → update + notif
    [k(2)]: slot(2, 111, 72329), // 352 — extra, att=225 → conflict → update + notif
    [k(3)]: slot(3, 111, 72327), // 354 — extra, att=225 → conflict → update + notif
    [k(4)]: slot(4, 111, 72327), // 355 — extra, att=225 → conflict → update + notif
  },
};

/**
 * `extra_conflicts` — Corrections confirmed (deleted). Extras conflict.
 *
 * Expected outcome:
 *   • 14 corrections deleted (no notifications)
 *   • 4 extras conflict → 4 updates, 4 "Attendance Conflict 💀" notifications
 */
const EXTRA_CONFLICTS: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 72327), // 332 — correction → delete
    [k(4)]: slot(4, 225, 72327), // 333 — correction → delete
    [k(6)]: slot(6, 225, 72326), // 335 — correction → delete
    [k(1)]: slot(1, 225, 72328), // 345 — correction → delete
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 72325), // 336 — correction → delete
    [k(4)]: slot(4, 225, 72329), // 338 — correction → delete
    [k(3)]: slot(3, 225, 72323), // 339 — correction → delete
    [k(2)]: slot(2, 225, 72328), // 340 — correction → delete
    [k(1)]: slot(1, 225, 72324), // 341 — correction → delete
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 72326), // 342 — correction → delete
    [k(2)]: slot(2, 225, 72324), // 343 — correction → delete
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 72324), // 348 — correction → delete
    [k(4)]: slot(4, 225, 72329), // 349 — correction → delete
  },
  "2025-11-03": {
    [k(3)]: slot(3, 225, 72323), // 351 — correction → delete
  },
  "2025-12-31": {
    [k(1)]: slot(1, 111, 72323), // 334 — extra → CONFLICT
    [k(2)]: slot(2, 111, 72329), // 352 — extra → CONFLICT
    [k(3)]: slot(3, 111, 72327), // 354 — extra → CONFLICT
    [k(4)]: slot(4, 111, 72327), // 355 — extra → CONFLICT
  },
};

/**
 * `course_mismatch` — Official shows a different course for all extras; corrections confirmed.
 *
 * Course 99001 = a course not in the courses list (name falls back to "99001").
 *
 * Expected outcome:
 *   • 14 corrections deleted (official confirms same course → delete)
 *   • 4 extras: course mismatch (official=99001 vs tracker=72323/72329/72327)
 *       → deleted + "Course Mismatch 💀" notification for each extra
 */
const COURSE_MISMATCH: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 72327), // 332 — correction → delete
    [k(4)]: slot(4, 225, 72327), // 333 — correction → delete
    [k(6)]: slot(6, 225, 72326), // 335 — correction → delete
    [k(1)]: slot(1, 225, 72328), // 345 — correction → delete
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 72325), // 336 → delete
    [k(4)]: slot(4, 225, 72329), // 338 → delete
    [k(3)]: slot(3, 225, 72323), // 339 → delete
    [k(2)]: slot(2, 225, 72328), // 340 → delete
    [k(1)]: slot(1, 225, 72324), // 341 → delete
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 72326), // 342 → delete
    [k(2)]: slot(2, 225, 72324), // 343 → delete
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 72324), // 348 → delete
    [k(4)]: slot(4, 225, 72329), // 349 → delete
  },
  "2025-11-03": {
    [k(3)]: slot(3, 225, 72323), // 351 → delete
  },
  "2025-12-31": {
    [k(1)]: slot(1, 110, 99001), // 334 — extra, course mismatch → delete + "Course Mismatch 💀"
    [k(2)]: slot(2, 225, 99001), // 352 — extra, course mismatch → delete + "Course Mismatch 💀"
    [k(3)]: slot(3, 225, 99001), // 354 — extra, course mismatch → delete + "Course Mismatch 💀"
    [k(4)]: slot(4, 225, 99001), // 355 — extra, course mismatch → delete + "Course Mismatch 💀"
  },
};

/**
 * `course_mismatch_all` — Different course for EVERY tracked slot (corrections + extras).
 *
 * Expected outcome:
 *   • 14 corrections: course mismatch → deleted, NO notifications (status=correction, not extra)
 *   • 4 extras: course mismatch → deleted + "Course Mismatch 💀" notifications
 */
const COURSE_MISMATCH_ALL: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 99001), // 332 — correction + mismatch → delete (no notif)
    [k(4)]: slot(4, 225, 99001), // 333 — correction + mismatch → delete (no notif)
    [k(6)]: slot(6, 225, 99001), // 335 — correction + mismatch → delete (no notif)
    [k(1)]: slot(1, 225, 99001), // 345 — correction + mismatch → delete (no notif)
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 99001),
    [k(4)]: slot(4, 225, 99001),
    [k(3)]: slot(3, 225, 99001),
    [k(2)]: slot(2, 225, 99001),
    [k(1)]: slot(1, 225, 99001),
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 99001),
    [k(2)]: slot(2, 225, 99001),
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 99001),
    [k(4)]: slot(4, 225, 99001),
  },
  "2025-11-03": {
    [k(3)]: slot(3, 225, 99001),
  },
  "2025-12-31": {
    [k(1)]: slot(1, 110, 99001), // 334 — extra + mismatch → delete + notif
    [k(2)]: slot(2, 225, 99001), // 352 — extra + mismatch → delete + notif
    [k(3)]: slot(3, 225, 99001), // 354 — extra + mismatch → delete + notif
    [k(4)]: slot(4, 225, 99001), // 355 — extra + mismatch → delete + notif
  },
};

/**
 * `null_slots` — Slots corresponding to all 2025-12-31 entries are null
 * (holiday/empty day from EzyGo). Everything else is confirmed.
 *
 * Expected outcome:
 *   • 14 corrections deleted (confirmed for all non-Dec-31 dates)
 *   • 334, 352, 354, 355 stay (Dec 31 is null → key skipped → no officialMap entry)
 */
const NULL_SLOTS: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 72327),
    [k(4)]: slot(4, 225, 72327),
    [k(6)]: slot(6, 225, 72326),
    [k(1)]: slot(1, 225, 72328),
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 72325),
    [k(4)]: slot(4, 225, 72329),
    [k(3)]: slot(3, 225, 72323),
    [k(2)]: slot(2, 225, 72328),
    [k(1)]: slot(1, 225, 72324),
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 72326),
    [k(2)]: slot(2, 225, 72324),
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 72324),
    [k(4)]: slot(4, 225, 72329),
  },
  "2025-11-03": {
    [k(3)]: slot(3, 225, 72323),
  },
  "2025-12-31": {
    // Null slots — EzyGo marks this day as holiday / no data
    [k(1)]: { session: 1, attendance: null, course: null, class_type: null }, // 334 stays
    [k(2)]: { session: 2, attendance: null, course: null, class_type: null }, // 352 stays
    [k(3)]: { session: 3, attendance: null, course: null, class_type: null }, // 354 stays
    [k(4)]: { session: 4, attendance: null, course: null, class_type: null }, // 355 stays
  },
};

/**
 * `revision` — Slots on 2025-12-31 are marked as "Revision" class_type.
 * Revision sessions are skipped by the sync logic.
 *
 * Expected outcome:
 *   • 14 corrections deleted (confirmed for non-Dec-31 dates)
 *   • 334, 352, 354, 355 stay (Revision slots skipped → no officialMap key)
 */
const REVISION: AttendanceData = {
  ...NULL_SLOTS, // reuse non-Dec-31 confirmed data
  "2025-12-31": {
    [k(1)]: slot(1, 110, 72323, "Revision"), // 334 — Revision → skipped
    [k(2)]: slot(2, 225, 72329, "Revision"), // 352 — Revision → skipped
    [k(3)]: slot(3, 225, 72327, "Revision"), // 354 — Revision → skipped
    [k(4)]: slot(4, 225, 72327, "Revision"), // 355 — Revision → skipped
  },
};

/**
 * `no_record` — EzyGo returns an empty attendance dataset.
 * No officialMap keys → every tracker entry stays untouched.
 *
 * Expected outcome:
 *   • 0 deletions, 0 updates, 0 notifications
 */
const NO_RECORD: AttendanceData = {};

/**
 * `mixed` — Realistic combination of all outcomes in a single sync.
 *
 * Per-item breakdown:
 *  332 (correction, att=110, 2025-10-24/III) → official 110 → DELETE
 *  333 (correction, att=225, 2025-10-24/IV)  → official 225 → DELETE
 *  335 (correction, att=225, 2025-10-24/VI)  → official 225 → DELETE
 *  345 (correction, att=225, 2025-10-24/I)   → official 225 → DELETE
 *  336 (correction, att=225, 2025-10-06/VI)  → official 225 → DELETE
 *  338 (correction, att=225, 2025-10-06/IV)  → official 225 → DELETE
 *  339 (correction, att=225, 2025-10-06/III) → official 225 → DELETE
 *  340 (correction, att=225, 2025-10-06/II)  → official 225 → DELETE
 *  341 (correction, att=225, 2025-10-06/I)   → official 225 → DELETE
 *  342 (correction, att=225, 2025-09-25/IV)  → official 225 → DELETE
 *  343 (correction, att=225, 2025-09-25/II)  → official 225 → DELETE
 *  348 (correction, att=225, 2025-11-06/II)  → official 225 → DELETE
 *  349 (correction, att=225, 2025-11-06/IV)  → official 225 → DELETE
 *  351 (correction, att=225, 2025-11-03/III) → null slot    → STAYS
 *  334 (extra,      att=110, 2025-12-31/I)   → official 111 → CONFLICT + notif
 *  352 (extra,      att=225, 2025-12-31/II)  → course mismatch (99001) → DELETE + "Course Mismatch" notif
 *  354 (extra,      att=225, 2025-12-31/III) → course mismatch (99001) → DELETE + "Course Mismatch" notif
 *  355 (extra,      att=225, 2025-12-31/IV)  → official 225 → DELETE (confirmed)
 *
 * Expected outcome:
 *   • 16 deletions (13 corrections + 352 mismatch + 354 mismatch + 355 confirmed)
 *   • 1 update  (334 conflict)
 *   • 1 conflict
 *   • 3 notifications: 1 "Attendance Conflict 💀" (334), 2 "Course Mismatch 💀" (352, 354)
 *   • 1 item stays: 351 (null slot)
 */
const MIXED: AttendanceData = {
  "2025-10-24": {
    [k(3)]: slot(3, 110, 72327), // 332 confirmed → delete
    [k(4)]: slot(4, 225, 72327), // 333 confirmed → delete
    [k(6)]: slot(6, 225, 72326), // 335 confirmed → delete
    [k(1)]: slot(1, 225, 72328), // 345 confirmed → delete
  },
  "2025-10-06": {
    [k(6)]: slot(6, 225, 72325), // 336 → delete
    [k(4)]: slot(4, 225, 72329), // 338 → delete
    [k(3)]: slot(3, 225, 72323), // 339 → delete
    [k(2)]: slot(2, 225, 72328), // 340 → delete
    [k(1)]: slot(1, 225, 72324), // 341 → delete
  },
  "2025-09-25": {
    [k(4)]: slot(4, 225, 72326), // 342 → delete
    [k(2)]: slot(2, 225, 72324), // 343 → delete
  },
  "2025-11-06": {
    [k(2)]: slot(2, 225, 72324), // 348 → delete
    [k(4)]: slot(4, 225, 72329), // 349 → delete
  },
  "2025-11-03": {
    // Null slot for 351 — correction stays
    [k(3)]: { session: 3, attendance: null, course: null, class_type: null },
  },
  "2025-12-31": {
    [k(1)]: slot(1, 111, 72323), // 334 extra → CONFLICT (official absent, tracker present)
    [k(2)]: slot(2, 225, 99001), // 352 extra → course MISMATCH → delete + notif
    [k(3)]: slot(3, 225, 99001), // 354 extra → course MISMATCH → delete + notif
    [k(4)]: slot(4, 225, 72327), // 355 extra confirmed → delete
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SCENARIOS = new Map<string, AttendanceData>([
  ["confirmed", CONFIRMED],
  ["all_absent", ALL_ABSENT],
  ["extra_conflicts", EXTRA_CONFLICTS],
  ["course_mismatch", COURSE_MISMATCH],
  ["course_mismatch_all", COURSE_MISMATCH_ALL],
  ["null_slots", NULL_SLOTS],
  ["revision", REVISION],
  ["no_record", NO_RECORD],
  ["mixed", MIXED],
]);

/** Available scenario names (for logging / error messages). */
export const AVAILABLE_SCENARIOS = Array.from(SCENARIOS.keys());

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EzygoMockResponses {
  courses: Response;
  attendance: Response;
}

/**
 * Returns mock `Response` objects for the two EzyGo API calls, or `null`
 * if the scenario name is not recognised.
 */
export function getMockResponses(scenario: string): EzygoMockResponses | null {
  const data = SCENARIOS.get(scenario);
  if (!data) return null;

  const coursesResponse = new Response(JSON.stringify(MOCK_COURSES), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const attendanceResponse = new Response(
    JSON.stringify({ studentAttendanceData: data }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

  return { courses: coursesResponse, attendance: attendanceResponse };
}
