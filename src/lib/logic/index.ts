/**
 * Barrel index for @/lib/logic — single entry point for all shared attendance logic.
 *
 * Consuming modules should import from '@/lib/logic' rather than from individual
 * file paths, so that any internal reorganisation only requires updating this file.
 *
 * @example
 * ```ts
 * import { ATTENDANCE_STATUS, isPositive, getReconciledStats } from '@/lib/logic';
 * import { calculateAttendance } from '@/lib/logic';
 * ```
 */
export {
  ATTENDANCE_STATUS,
  isPositive,
  isAbsent,
  getOfficialSessionRaw,
  getReconciledStats,
} from "./attendance-reconciliation";

export type { ReconciledStats } from "./attendance-reconciliation";

export { calculateAttendance } from "./bunk";
export type { AttendanceResult } from "./bunk";
