"use client";

import { useCallback, useMemo } from "react";
import { useUserSettings } from "@/providers/user-settings";
import { DisabledCoursesMap } from "@/types/user-settings";

/**
 * Generates the semester key used as the top-level key in `disabled_courses`.
 * Format: `"<academicYear>-<semester>"` e.g. `"2025-2026-even"`.
 */
export function makeSemesterKey(
  academicYear: string | null | undefined,
  semester: string | null | undefined
): string | null {
  if (!academicYear || !semester) return null;
  return `${academicYear}-${semester}`;
}

export interface UseDisabledCoursesOptions {
  /** Current academic year, e.g. "2025-2026" */
  academicYear: string | null | undefined;
  /** Current semester, e.g. "even" or "odd" */
  semester: string | null | undefined;
}

export interface UseDisabledCoursesReturn {
  /** Full disabled-courses map from settings (all semesters) */
  disabledCoursesMap: DisabledCoursesMap;
  /** Set of disabled course codes for the current semester (upper-cased) */
  disabledCodes: Set<string>;
  /** Check whether a course code is disabled in the current semester */
  isDisabled: (code: string) => boolean;
  /** Get the disable reason for a course code in the current semester (or null) */
  getDisableReason: (code: string) => string | null;
  /** Disable a course code with a reason in the current semester */
  disableCourse: (code: string, reason: string) => Promise<void>;
  /** Enable a previously-disabled course code in the current semester */
  enableCourse: (code: string) => Promise<void>;
  /** Whether the settings are still loading */
  isLoading: boolean;
}

/**
 * Hook to manage disabled courses per semester.
 *
 * Provides helpers to check, disable, and enable courses, backed by the
 * `disabled_courses` JSONB column in `user_settings`.
 *
 * @example
 * ```tsx
 * async function handleCourseToggle() {
 * const { isDisabled, disableCourse, enableCourse } = useDisabledCourses({
 *   academicYear: "2025-2026",
 *   semester: "even",
 * });
 *
 * if (isDisabled("GXEST204")) { … }
 * await disableCourse("GXEST204", "Challenge passed");
 * await enableCourse("GXEST204");
 * }
 * ```
 */
export function useDisabledCourses({
  academicYear,
  semester,
}: UseDisabledCoursesOptions): UseDisabledCoursesReturn {
  const { settings, isLoading, updateDisabledCourses } = useUserSettings();

  const disabledCoursesMap: DisabledCoursesMap = useMemo(
    () => settings?.disabled_courses ?? {},
    [settings?.disabled_courses]
  );

  const semKey = useMemo(
    () => makeSemesterKey(academicYear, semester),
    [academicYear, semester]
  );

  /** Set of upper-cased course codes disabled for the current semester */
  const disabledCodes = useMemo(() => {
    if (!semKey || !Object.prototype.hasOwnProperty.call(disabledCoursesMap, semKey)) return new Set<string>();
    const semMap = Reflect.get(disabledCoursesMap, semKey) ?? {};
    return new Set(Object.keys(semMap).map((c) => c.toUpperCase()));
  }, [semKey, disabledCoursesMap]);

  const isDisabled = useCallback(
    (code: string) => disabledCodes.has(code.toUpperCase()),
    [disabledCodes]
  );

  const getDisableReason = useCallback(
    (code: string): string | null => {
      if (!semKey) return null;
      if (!Object.prototype.hasOwnProperty.call(disabledCoursesMap, semKey)) return null;
      const semMap = Reflect.get(disabledCoursesMap, semKey);
      if (!semMap) return null;
      // Case-insensitive lookup
      const upperCode = code.toUpperCase();
      const entry = Object.entries(semMap).find(
        ([k]) => k.toUpperCase() === upperCode
      );
      return entry ? entry[1] : null;
    },
    [semKey, disabledCoursesMap]
  );

  const disableCourse = useCallback(
    async (code: string, reason: string) => {
      if (!semKey) return;
      const newMap: DisabledCoursesMap = structuredClone(disabledCoursesMap);
      if (!Object.prototype.hasOwnProperty.call(newMap, semKey)) {
        Reflect.set(newMap, semKey, {});
      }
      const semMap = Reflect.get(newMap, semKey)!;
      Reflect.set(semMap, code.toUpperCase(), reason);
      await updateDisabledCourses(newMap);
    },
    [semKey, disabledCoursesMap, updateDisabledCourses]
  );

  const enableCourse = useCallback(
    async (code: string) => {
      if (!semKey) return;
      const newMap: DisabledCoursesMap = structuredClone(disabledCoursesMap);
      if (!Object.prototype.hasOwnProperty.call(newMap, semKey)) return;
      
      const semMap = Reflect.get(newMap, semKey)!;
      const upperCode = code.toUpperCase();
      
      // Remove (case-insensitive)
      Object.keys(semMap).forEach((key) => {
        if (key.toUpperCase() === upperCode) {
          Reflect.deleteProperty(semMap, key);
        }
      });

      // Remove empty semester bucket
      if (Object.keys(semMap).length === 0) {
        Reflect.deleteProperty(newMap, semKey);
      }
      await updateDisabledCourses(newMap);
    },
    [semKey, disabledCoursesMap, updateDisabledCourses]
  );

  return {
    disabledCoursesMap,
    disabledCodes,
    isDisabled,
    getDisableReason,
    disableCourse,
    enableCourse,
    isLoading,
  };
}
