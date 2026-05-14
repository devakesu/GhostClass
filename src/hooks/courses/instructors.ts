"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";
import { useProfile } from "@/hooks/users/profile";

export interface CourseInstructor {
  course_code: string;
  instructor_name: string | null;
  semester?: string | null;
  academic_year?: string | null;
}

interface UseFetchCourseInstructorsOptions {
  semester?: string;
  year?: string;
  enabled?: boolean;
}


export function useFetchCourseInstructors(
  { semester, year, enabled = true }: UseFetchCourseInstructorsOptions = {},
) {
  const { data: profile } = useProfile();
  const classId = profile?.class?.id;

  return useQuery<CourseInstructor[]>({
    queryKey: ["course_instructors", semester ?? null, year ?? null, classId ?? null],
    enabled: enabled && !!semester && !!year && !!classId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("course_instructors")
          .select("course_code, instructor_name, semester, academic_year")
          .eq("semester", semester!)
          .eq("academic_year", year!)
          .eq("class_id", classId!);

        if (error) {
          throw error;
        }

        return (data ?? []) as CourseInstructor[];
      } catch (error) {
        logger.warn("Failed to load course instructors", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  });
}

export const useCourseInstructors = useFetchCourseInstructors;
