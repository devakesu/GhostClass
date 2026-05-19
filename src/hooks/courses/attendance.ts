// Fetch attendance report and course details hooks
// src/hooks/courses/attendance.ts

import axios from "@/lib/axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@/lib/logger";
import { useMemo } from "react";
import { AttendanceReport, CourseDetail } from "@/types";
import { retryOnce, retryTwice } from "@/lib/query-utils";
import { useFetchSemester, useFetchAcademicYear } from "../users/settings";

/** Normalize the EzyGo API typos (`totel`, `persantage`) into `total` / `percentage`. */
function normalizeCourseDetail(raw: unknown): CourseDetail {
  const data = raw as {
    totel?: number;
    total?: number;
    persantage?: number;
    persentage?: number;
    percentage?: number;
  } & CourseDetail;
  const { totel, total, persantage, persentage, percentage, ...rest } = data;
  return {
    ...rest,
    // Prefer EzyGo's historical misspelled keys first, then fallback to corrected keys.
    total: totel ?? total ?? data.total,
    percentage: persantage ?? persentage ?? percentage ?? data.percentage,
  } satisfies CourseDetail;
}

/** 
 * Cache the working endpoint typo variant to avoid redundant 404s/retries on load.
 * EzyGo environments usually standardize on one variant across all courses.
 */
let workingSummaryEndpoint: "summery" | "summary" | null = null;

async function fetchCourseSummaryWithFallback(ezygoId: number) {
  // If we already know which endpoint works, use it immediately.
  if (workingSummaryEndpoint) {
    return await axios.get(
      `/attendancereports/institutionuser/courses/${ezygoId}/${workingSummaryEndpoint}`
    );
  }

  try {
    // Try the common EzyGo typo first
    const res = await axios.get(
      `/attendancereports/institutionuser/courses/${ezygoId}/summery`
    );
    workingSummaryEndpoint = "summery";
    return res;
  } catch (err) {
    // If 'summery' failed, log and try 'summary' and cache the result if successful
    logger?.dev?.("/summery attempt failed, falling back to /summary", err);
    const res = await axios.get(
      `/attendancereports/institutionuser/courses/${ezygoId}/summary`
    );
    workingSummaryEndpoint = "summary";
    return res;
  }
}

/**
 * Standalone async function that fetches and normalizes a single course's
 * attendance summary. Shared by both `useCourseDetails` and the batch hook
 * so the fetch logic is never duplicated.
 */
async function fetchCourseDetail(courseId: string, ezygoId: number, courseName?: string): Promise<CourseDetail> {
  // If ezygoId is 0, it's a student-added "custom" course not yet official in EzyGo.
  // Return a shell CourseDetail with the provided courseName to avoid 404 spam.
  if (!ezygoId || ezygoId === 0) {
    return {
      present: 0,
      absent: 0,
      total: 0,
      percentage: 0,
      course: {
        id: 0,
        name: courseName || "Course",
        code: courseId
      }
    };
  }

  const res = await fetchCourseSummaryWithFallback(ezygoId);
  if (!res) throw new Error("Failed to fetch course details data");
  return normalizeCourseDetail(res.data);
}

/** Shared query options for a single course — keeps staleTime/gcTime/etc. in sync. */
function courseDetailQueryOptions(courseId: string, ezygoId: number, courseName?: string) {
  return {
    // Key on both courseId and ezygoId to ensure attendance details are cached
    // independently across semesters/enrollments.
    queryKey: ["attendance-report", courseId, ezygoId] as const,
    queryFn: () => fetchCourseDetail(courseId, ezygoId, courseName),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  };
}

export const useAttendanceReport = (semester?: string, year?: string, options?: { enabled?: boolean; initialData?: AttendanceReport }) => {
  return useQuery<AttendanceReport>({
    queryKey: ["attendance-report", semester, year],
    queryFn: async () => {
      const res = await axios.post("/attendancereports/student/detailed", {
        semester,
        year
      });
      if (!res) throw new Error("Failed to fetch attendance report data");
      return res.data;
    },
    // Default to false to prevent firing before params are ready.
    enabled: options?.enabled ?? (!!semester && !!year),
    initialData: options?.initialData ?? undefined,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: retryOnce,
  });
};

export const useCourseDetails = (
  courseId: string, 
  ezygoId: number, 
  courseName?: string, 
  options: { enabled?: boolean; staleTime?: number } = {}
) => {
  return useQuery<CourseDetail>({
    ...courseDetailQueryOptions(courseId, ezygoId, courseName),
    enabled: options.enabled !== false && !!courseId,
    staleTime: options.staleTime ?? courseDetailQueryOptions(courseId, ezygoId, courseName).staleTime,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: retryTwice,
  });
};

/**
 * Batch-prefetch all course summaries.
 * Accepts an array of objects containing code, id, and name to handle suppression and naming.
 */
export const useAllCourseDetails = (courses: { code: string; id: number; name: string }[]) => {
  const queryClient = useQueryClient();
  const { data: semester } = useFetchSemester();
  const { data: year } = useFetchAcademicYear();
  
  // Explicitly deduplicate courses by code to prevent redundant batching.
  // This ensures the queryKey remains stable and the API receives a clean list.
  const uniqueCourses = useMemo(() => {
    const seen = new Set<string>();
    return courses.filter((c: { code: string; id: number; name: string }) => {
      const code = c.code.toUpperCase().replace(/[\s\u00A0-]/g, "");
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
  }, [courses]);

  const sortedCodes = useMemo(() => 
    uniqueCourses.map(c => c.code.toUpperCase().replace(/[\s\u00A0-]/g, "")).sort(),
    [uniqueCourses]
  );

  return useQuery<Record<string, CourseDetail>>({
    queryKey: ["attendance-report-all", sortedCodes, semester ?? null, year ?? null],
    queryFn: async () => {
      const res = await axios.post("/api/attendance/summary-batch", { courses: uniqueCourses }, { baseURL: "" });
      if (!res || !res.data) throw new Error("Failed to fetch batch course details");
      
      // Normalize each item and update the individual query cache
      const data: Record<string, CourseDetail> = {};
      // Build a whitelist of expected course codes to avoid object-injection sinks
      const validCodes = new Set(uniqueCourses.map((c) => c.code));
      const resObj = res.data as Record<string, unknown> | null | undefined;
      
      if (resObj && typeof resObj === "object") {
        for (const [code, rawDetail] of Object.entries(resObj)) {
          if (typeof code !== "string" || !validCodes.has(code)) continue;
          if (!Object.prototype.hasOwnProperty.call(resObj, code)) continue;

          const detail = normalizeCourseDetail(rawDetail);
          Reflect.set(data, code, detail);

          const course = uniqueCourses.find((c: { code: string; id: number; name: string }) => c.code === code);
          if (course) {
            queryClient.setQueryData(["attendance-report", code, Number(course.id)], detail);
          }
        }
      }

      return data;
    },
    enabled: uniqueCourses.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: retryTwice,
  });
};

/** TEST ONLY: Reset module-level singleton state. */
export function _resetModuleState() {
  workingSummaryEndpoint = null;
}
