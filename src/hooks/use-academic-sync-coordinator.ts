"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import axios from "@/lib/axios";
import { logger } from "@/lib/logger";
import { semestersDiffer, yearsDiffer } from "@/lib/logic/academic";
import {
  extractAcademicYearValue,
  extractSemesterValue,
} from "@/hooks/users/settings";
import { toast } from "sonner";

export type SemesterType = "even" | "odd" | null;

export interface AcademicCheckResult {
  hasChanged: boolean;
  semester: SemesterType;
  academicYear: string | null;
}

/**
 * Fetches fresh, non-cached academic semester and academic year from EzyGo.
 * Explicitly sends cache-busting timestamp and anti-cache headers.
 */
export async function fetchLiveAcademicPeriod(): Promise<{
  semester: SemesterType;
  academicYear: string | null;
}> {
  const timestamp = Date.now();
  const requestOptions = {
    params: { _t: timestamp },
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  };

  const [semRes, yearRes] = await Promise.all([
    axios.get("/user/setting/default_semester", requestOptions).catch((err) => {
      logger.warn("[AcademicCoordinator] Failed to fetch live semester", err);
      return null;
    }),
    axios
      .get("/user/setting/default_academic_year", requestOptions)
      .catch((err) => {
        logger.warn(
          "[AcademicCoordinator] Failed to fetch live academic year",
          err,
        );
        return null;
      }),
  ]);

  const semester = semRes ? extractSemesterValue(semRes.data) : null;
  const academicYear = yearRes ? extractAcademicYearValue(yearRes.data) : null;

  return { semester, academicYear };
}

/**
 * Shared invalidation helper for all term-dependent queries across the web application.
 */
export async function invalidateAllTermQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["semester"] }),
    queryClient.invalidateQueries({ queryKey: ["academic-year"] }),
    queryClient.invalidateQueries({ queryKey: ["courses"] }),
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] }),
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] }),
    queryClient.invalidateQueries({ queryKey: ["class_courses"] }),
    queryClient.invalidateQueries({ queryKey: ["course_instructors"] }),
    queryClient.invalidateQueries({ queryKey: ["track_data"] }),
    queryClient.invalidateQueries({ queryKey: ["count"] }),
    queryClient.invalidateQueries({ queryKey: ["tracking_count"] }),
    queryClient.invalidateQueries({ queryKey: ["profile"] }),
    queryClient.invalidateQueries({ queryKey: ["profile", "synced"] }),
    queryClient.invalidateQueries({ queryKey: ["exams"] }),
    queryClient.invalidateQueries({ queryKey: ["exam-answers"] }),
    queryClient.invalidateQueries({ queryKey: ["exam-questions"] }),
    queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] }),
    queryClient.invalidateQueries({ queryKey: ["student_leaves"] }),
  ]);
}

async function executeRolloverTransition(
  queryClient: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
  freshSem: SemesterType,
  freshYear: string | null,
): Promise<void> {
  if (freshSem) {
    queryClient.setQueryData(["semester"], freshSem);
  }
  if (freshYear) {
    queryClient.setQueryData(["academic-year"], freshYear);
  }

  try {
    await axios.get("/api/profile", {
      baseURL: "",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
      params: { sync: "true", force: "true", _t: Date.now() },
    });
  } catch (syncErr) {
    logger.warn(
      "[AcademicCoordinator] Profile sync on rollover non-fatal error",
      syncErr,
    );
  }

  await invalidateAllTermQueries(queryClient);
  router.refresh();

  toast.info(
    `Academic period updated to ${
      freshSem?.toUpperCase() ?? ""
    } ${freshYear ?? ""}`.trim(),
  );
}

/**
 * Academic Sync Coordinator Hook
 *
 * Runs across all protected (logged-in) pages in the web app.
 * Guarantees that:
 * 1. The sem/year check query never returns cached old data.
 * 2. Any change in semester or academic year immediately invalidates all
 *    term-dependent caches, updates settings state, and triggers Next.js router reload.
 */
export function useAcademicSyncCoordinator(): {
  checkAcademicRollover: () => Promise<AcademicCheckResult>;
} {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const appliedRef = useRef<{
    semester: string | null;
    year: string | null;
  } | null>(null);

  const inFlightPromiseRef = useRef<Promise<AcademicCheckResult> | null>(null);

  const checkAcademicRollover = useCallback(async (): Promise<
    AcademicCheckResult
  > => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    const checkPromise = (async (): Promise<AcademicCheckResult> => {
      try {
        const { semester: freshSem, academicYear: freshYear } =
          await fetchLiveAcademicPeriod();

        if (!freshSem && !freshYear) {
          return { hasChanged: false, semester: null, academicYear: null };
        }

        const cachedSem = queryClient.getQueryData<string>(["semester"]) ??
          null;
        const cachedYear = queryClient.getQueryData<string>([
          "academic-year",
        ]) ?? null;

        const baselineSem = appliedRef.current?.semester ?? cachedSem;
        const baselineYear = appliedRef.current?.year ?? cachedYear;

        const semChanged = freshSem != null && (
          (baselineSem != null && semestersDiffer(baselineSem, freshSem)) ||
          (cachedSem != null && semestersDiffer(cachedSem, freshSem))
        );
        const yearChanged = freshYear != null && (
          (baselineYear != null && yearsDiffer(baselineYear, freshYear)) ||
          (cachedYear != null && yearsDiffer(cachedYear, freshYear))
        );

        // Always seed query cache with fresh period if missing or divergent
        if (freshSem && (!cachedSem || semestersDiffer(cachedSem, freshSem))) {
          queryClient.setQueryData(["semester"], freshSem);
        }
        if (freshYear && (!cachedYear || yearsDiffer(cachedYear, freshYear))) {
          queryClient.setQueryData(["academic-year"], freshYear);
        }

        // Establish initial applied baseline if not present
        if (!appliedRef.current) {
          appliedRef.current = {
            semester: freshSem,
            year: freshYear,
          };
        }

        if (semChanged || yearChanged) {
          logger.info(
            `[AcademicCoordinator] Academic rollover detected (sem: ${baselineSem ?? cachedSem} -> ${freshSem}, year: ${baselineYear ?? cachedYear} -> ${freshYear}). Invalidating queries, purging server cache, and reloading.`,
          );

          appliedRef.current = {
            semester: freshSem ?? baselineSem,
            year: freshYear ?? baselineYear,
          };

          await executeRolloverTransition(queryClient, router, freshSem, freshYear);

          return {
            hasChanged: true,
            semester: freshSem,
            academicYear: freshYear,
          };
        }

        return {
          hasChanged: false,
          semester: freshSem ?? (baselineSem as SemesterType),
          academicYear: freshYear ?? baselineYear,
        };
      } catch (err) {
        logger.warn("[AcademicCoordinator] Academic check encountered error", err);
        return {
          hasChanged: false,
          semester: null,
          academicYear: null,
        };
      } finally {
        inFlightPromiseRef.current = null;
      }
    })();

    inFlightPromiseRef.current = checkPromise;
    return checkPromise;
  }, [queryClient, router]);

  // Check on mount of any protected page and when navigating between protected pages
  useEffect(() => {
    void checkAcademicRollover();
  }, [pathname, checkAcademicRollover]);

  // Check on window focus and visibility change
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void checkAcademicRollover();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [checkAcademicRollover]);

  return { checkAcademicRollover };
}

/**
 * Component variant that can be rendered directly into layout.tsx
 */
export function AcademicSyncCoordinator(): null {
  useAcademicSyncCoordinator();
  return null;
}
