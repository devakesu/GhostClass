/**
 * Represents a per-user settings row stored in the `user_settings` table.
 */
export interface UserSettings {
  bunk_calculator_enabled: boolean;
  target_percentage: number;
  /**
   * Per-semester map of disabled course codes and their disable reasons.
   * Schema: `{ "year-sem": { "courseCode": "reason" } }`
   * Example: `{ "2025-2026-even": { "GXEST204": "Challenge passed" } }`
   *
   * When a course is disabled it is excluded from dashboard aggregate stats
   * and the attendance chart, but continues to appear on the course card
   * grid and the attendance calendar (with a "Disabled" badge).
   *
   * Mirrors the DB column: `disabled_courses jsonb NOT NULL DEFAULT '{}'`.
   */
  disabled_courses: DisabledCoursesMap;
}

/**
 * Nested map: semester key → course code → disable reason.
 * Semester key format: `"<academicYear>-<semester>"` e.g. `"2025-2026-even"`.
 */
export type DisabledCoursesMap = Record<string, Record<string, string>>;
