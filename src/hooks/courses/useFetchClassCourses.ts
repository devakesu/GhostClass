"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/users/profile";
import { logger } from "@/lib/logger";

export interface ClassCourse {
  id: number;
  course_code: string;
  course_name: string;
  semester?: string;
  academic_year?: string;
}

interface UseFetchClassCoursesOptions {
  semester?: string;
  year?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch "shared" courses for a specific class from the 'class_courses' table.
 * These are custom courses added by class representatives or admins that might not
 * be present in the official EzyGo enrollment list.
 */
export function useFetchClassCourses(
  { semester, year, enabled = true }: UseFetchClassCoursesOptions = {},
) {
  const { data: profile } = useProfile();
  const classId = profile?.class?.id;

  return useQuery<ClassCourse[]>({
    queryKey: [
      "class_courses",
      semester ?? null,
      year ?? null,
      classId ?? null,
    ],
    enabled: enabled && !!semester && !!year && !!classId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("class_courses")
          .select("id, course_code, course_name")
          .eq("class_id", classId!);

        if (error) {
          throw error;
        }

        return (data ?? []) as ClassCourse[];
      } catch (error) {
        logger.warn("Failed to load class courses", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  });
}
