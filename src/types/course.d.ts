/**
 * Represents a course/subject in the academic system.
 * Contains course details, academic period info, and enrolled users.
 */
export interface Course {
  /** Unique course identifier */
  id: number;
  /** Serial number for ordering */
  si_no?: number;
  /** Course name */
  name: string;
  /** Course code (e.g., "CS101") */
  code?: string;
  /** Academic year (e.g., "2023-2024") */
  academic_year?: string;
  /** Academic semester (Even or Odd) */
  academic_semester?: string;
  /** User subgroup information */
  usersubgroup?: {
    /** Subgroup ID (semester-scoped — do NOT use for class identity) */
    id: number;
    /** Admin-set label — cosmetic only, inconsistent across semester transitions */
    name?: string;
    /** Semester start date (ISO format) */
    start_date: string;
    /** Semester end date (ISO format) */
    end_date: string;
    /**
     * Stable section-level identifier.
     * Confirmed constant across consecutive semesters for the same cohort
     * (real data: usersubgroup.id changed 9888→11509 between S1/S2 but this stayed 710).
     * Preferred identity field for classes.external_group_id over usersubgroup.id.
     */
    programme_config_group_id?: number;
    /** User group details */
    usergroup: {
      /** Group ID — programme-level fallback identity when programme_config_group_id is absent */
      id: number;
      /** Branch/department name (e.g. "Computer Science and Business Systems") */
      name: string;
      /** University affiliation */
      affiliated_university: string;
    };
  };
  /** List of enrolled institution users */
  institution_users?: CourseUser[];
}
