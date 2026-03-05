// Fetch attendance report and course details hooks
// src/hooks/courses/attendance.ts

import axios from "@/lib/axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AttendanceReport, CourseDetail } from "@/types";
import { retryOnce, retryTwice } from "@/lib/query-utils";

/** Normalize the EzyGo API typos (`totel`, `persantage`) into `total` / `percentage`. */
function normalizeCourseDetail(raw: unknown): CourseDetail {
  const data = raw as { totel?: number; persantage?: number } & CourseDetail;
  const { totel, persantage, ...rest } = data;
  return {
    ...rest,
    total: rest.total ?? totel,
    percentage: rest.percentage ?? persantage,
  } satisfies CourseDetail;
}

/**
 * Standalone async function that fetches and normalizes a single course's
 * attendance summary. Shared by both `useCourseDetails` and the batch hook
 * so the fetch logic is never duplicated.
 */
async function fetchCourseDetail(courseId: string): Promise<CourseDetail> {
  if (!courseId) throw new Error("Course ID is required");
  const res = await axios.get(
    `/attendancereports/institutionuser/courses/${courseId}/summery`
  );
  if (!res) throw new Error("Failed to fetch course details data");
  return normalizeCourseDetail(res.data);
}

/** Shared query options for a single course — keeps staleTime/gcTime/etc. in sync. */
function courseDetailQueryOptions(courseId: string) {
  return {
    queryKey: ["attendance-report", courseId] as const,
    queryFn: () => fetchCourseDetail(courseId),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  };
}

export const useAttendanceReport = (options?: { enabled?: boolean; initialData?: AttendanceReport }) => {
  return useQuery<AttendanceReport>({
    queryKey: ["attendance-report"],
    queryFn: async () => {
      const res = await axios.post("/attendancereports/student/detailed");
      if (!res) throw new Error("Failed to fetch attendance report data");
      return res.data;
    },
    enabled: options?.enabled,
    initialData: options?.initialData ?? undefined,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60 * 1000,
    retry: retryOnce,
  });
};

export const useCourseDetails = (courseId: string) => {
  return useQuery<CourseDetail>({
    ...courseDetailQueryOptions(courseId),
    enabled: !!courseId,
    refetchOnReconnect: true,
    refetchInterval: 5 * 60 * 1000,
    retry: retryTwice,
  });
};

/**
 * Batch-prefetch all course summaries using `queryClient.fetchQuery` so each
 * per-course fetch is registered under its own `["attendance-report", id]` key.
 *
 * Because we use the **same** query key that `useCourseDetails` uses, TanStack
 * Query deduplicates automatically: if a `CourseCard` mounts and calls
 * `useCourseDetails(id)` while the batch is in-flight, it subscribes to the
 * already-running promise instead of firing a second network request — fully
 * eliminating the N+1 API call pattern without any `setQueryData` side effects.
 *
 * Call this hook in the dashboard (or any parent) that has the full list of
 * course IDs before the course cards are rendered.
 */
export const useAllCourseDetails = (courseIds: string[]) => {
  const queryClient = useQueryClient();
  const sortedCourseIds = courseIds.slice().sort();
  return useQuery<Record<string, CourseDetail>>({
    queryKey: ["attendance-report-all", sortedCourseIds],
    queryFn: async () => {
      // fetchQuery uses the same per-course query key as useCourseDetails.
      // TanStack Query tracks these fetches: concurrent useCourseDetails calls
      // will deduplicate against in-flight promises rather than issuing new requests.
      const results = await Promise.all(
        courseIds.map((id) =>
          queryClient.fetchQuery<CourseDetail>({
            ...courseDetailQueryOptions(id),
            // Reuse any already-fresh per-course data (e.g. from a previous render).
            staleTime: 2 * 60 * 1000,
          })
        )
      );
      return Object.fromEntries(courseIds.map((id, i) => [id, results[i]]));
    },
    enabled: courseIds.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnReconnect: true,
    refetchInterval: 5 * 60 * 1000,
    retry: retryTwice,
  });
};
