/**
 * Represents a user-tracked attendance record.
 * Used for manual attendance tracking and corrections.
 */
export interface TrackAttendance {
  /** Authenticated user's UUID */
  auth_user_id: UUID;
  /** Course identifier */
  course: string;
  /** Attendance date (YYYYMMDD format) */
  date: string;
  /** Session identifier (Roman numeral or number) */
  session: string;
  /** Academic year */
  year: string;
  /** Semester identifier */
  semester: string;
  /** Record type (extra attendance or correction) */
  status?: "extra" | "correction";
  /** Attendance type ID (present/absent) */
  attendance?: number;
  /** Additional notes or comments */
  remarks?: string;
}
