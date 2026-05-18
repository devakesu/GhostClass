// Fetch courses hook
// src/hooks/courses/courses.ts

import axios from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";
import { Course } from "@/types";
import { retryOnce } from "@/lib/query-utils";

/**
 * React Query hook for fetching user's enrolled courses with student data.
 * Returns courses in a normalized object format keyed by course ID.
 * 
 * @param options - Optional configuration object
 * @param options.enabled - Whether the query should run (default: true)
 * @param options.initialData - Initial data to hydrate the query (from SSR)
 * @returns Query result with courses object
 * 
 * Query Configuration:
 * - Auto-refetch: Every 60 seconds
 * - Window focus refetch: Enabled
 * - Stale time: 30 seconds
 * - Cache time: 5 minutes
 * 
 * @example
 * ```tsx
 * const { data, isLoading } = useFetchCourses();
 * const course = data?.courses["101"];
 * ```
 */
export const useFetchCourses = (options?: {
  enabled?: boolean;
  initialData?: { courses: Record<string, Course> };
  semester?: string;
  year?: string;
}) => {
  return useQuery<{ courses: Record<string, Course> }>({
    queryKey: ["courses", options?.semester ?? null, options?.year ?? null],
    queryFn: async () => {
      const res = await axios.get("/institutionuser/courses/withusers");
      if (!res) throw new Error("Failed to fetch courses data");

      const courses = res.data || [];

      const formattedData = {
        courses: courses.reduce(
          (acc: Record<string, Course>, course: Course) => {
            acc[course.id.toString()] = course;
            return acc;
          },
          {}
        ),
      };

      return formattedData;
    },
    enabled: options?.enabled,
    initialData: options?.initialData ?? undefined,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: retryOnce,
    retryDelay: 1000,
  });
};
