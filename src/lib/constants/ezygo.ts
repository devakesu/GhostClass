/**
 * EzyGo API Constants
 *
 * Standardized status codes and identifiers used by the EzyGo attendance system.
 */

export const ATTENDANCE_STATUS = {
  /** Student attended the session */
  PRESENT: 110,
  /** Student was absent from the session */
  ABSENT: 111,
  /** Authorized duty leave (treated as present for percentage calculations) */
  DUTY_LEAVE: 225,
  /** Other types of authorized leave (e.g. medical, special) */
  OTHER_LEAVE: 112,
} as const;

export type AttendanceStatusCode =
  typeof ATTENDANCE_STATUS[keyof typeof ATTENDANCE_STATUS];

/**
 * Checks if an attendance code represents a "positive" presence (Attended or Duty Leave).
 * Note: OTHER_LEAVE is historically treated as positive in some parts of the UI,
 * but formally it is a leave type.
 */
export const isPositiveStatus = (code: number) =>
  code === ATTENDANCE_STATUS.PRESENT ||
  code === ATTENDANCE_STATUS.DUTY_LEAVE ||
  code === ATTENDANCE_STATUS.OTHER_LEAVE;

/**
 * Checks if an attendance code represents an absence.
 */
export const isAbsentStatus = (code: number) =>
  code === ATTENDANCE_STATUS.ABSENT;

/**
 * Default/placeholder remarks stored when a DL reason is not provided.
 * These should not be surfaced in the UI as user-entered reasons.
 */
export const DUTY_LEAVE_PLACEHOLDER_REMARKS = new Set<string>([
  "Duty Leave",
  "Self-Marked: Duty Leave",
  "Self-Marked: Present",
  "Self-Marked: Absent",
]);
