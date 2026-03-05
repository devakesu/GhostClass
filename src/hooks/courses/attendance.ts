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
    queryKey: ["attendance-report", courseId],
    queryFn: async () => {
      if (!courseId) throw new Error("Course ID is required");

      const res = await axios.get(
        `/attendancereports/institutionuser/courses/${courseId}/summery`
      );
      if (!res) throw new Error("Failed to fetch course details data");
      return normalizeCourseDetail(res.data);
    },
    enabled: !!courseId,
    staleTime: 2 * 60 * 1000, // 2 minutes - balance between real-time and performance
    gcTime: 10 * 60 * 1000,
    refetchOnReconnect: true, // Keep real-time on reconnect
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes instead of 1 minute
    retry: retryTwice,
  });
};

/**
 * Batch-prefetch all course summaries in a **single** query using `Promise.all`.
 *
 * After fetching, each result is written into the per-course TanStack Query cache
 * (`["attendance-report", courseId]`) so that `useCourseDetails` in every
 * `CourseCard` finds the data already populated and makes **zero** additional
 * network requests — eliminating the N+1 API call pattern.
 *
 * Call this hook in the dashboard (or any parent) that has the full list of
 * course IDs before the course cards are rendered.
 */
export const useAllCourseDetails = (courseIds: string[]) => {
  const queryClient = useQueryClient();
  const key = courseIds.slice().sort().join(",");
  return useQuery<Record<string, CourseDetail>>({
    queryKey: ["attendance-report-all", key],
    queryFn: async () => {
      const results = await Promise.all(
        courseIds.map(async (id) => {
          const res = await axios.get(
            `/attendancereports/institutionuser/courses/${id}/summery`
          );
          if (!res) throw new Error(`Failed to fetch course details for ${id}`);
          return { id, detail: normalizeCourseDetail(res.data) };
        })
      );
      const map: Record<string, CourseDetail> = {};
      for (const { id, detail } of results) {
        map[id] = detail;
        // Seed the per-course cache so useCourseDetails won't fire network requests.
        queryClient.setQueryData(["attendance-report", id], detail);
      }
      return map;
    },
    enabled: courseIds.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnReconnect: true,
    refetchInterval: 5 * 60 * 1000,
    retry: retryTwice,
  });
};
