// Fetch attendance report and course details hooks
// src/hooks/courses/attendance.ts

import axios from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";
import { AttendanceReport, CourseDetail } from "@/types";
import { retryOnce, retryTwice } from "@/lib/query-utils";

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
      // Normalize EzyGo API typos so the rest of the codebase uses correct field names.
      // Destructure out the misspelled fields so they can't leak through to consumers.
      const { totel, persantage, ...rest } = res.data as {
        totel?: number;
        persantage?: number;
      } & CourseDetail;
      return {
        ...rest,
        total: rest.total ?? totel,
        percentage: rest.percentage ?? persantage,
      } satisfies CourseDetail;
    },
    enabled: !!courseId,
    staleTime: 2 * 60 * 1000, // 2 minutes - balance between real-time and performance
    gcTime: 10 * 60 * 1000,
    refetchOnReconnect: true, // Keep real-time on reconnect
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes instead of 1 minute
    retry: retryTwice,
  });
};
