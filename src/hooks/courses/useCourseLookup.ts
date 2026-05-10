"use client";

import { useCallback } from "react";
import { Course } from "@/types";

interface UseCourseLookupProps {
  coursesData?: { courses: Record<string, Course> } | null;
  classCourses?: any[] | null;
  attendanceData?: any | null;
}

export function useCourseLookup({
  coursesData,
  classCourses,
  attendanceData,
}: UseCourseLookupProps) {
  const getCourseCodeById = useCallback(
    (id: string): string => {
      const normalizedInput = id.trim().toUpperCase().replace(/[\s\u00A0-]/g, "");

      // 1. Direct hit in coursesData
      if (coursesData?.courses?.[id]) {
        return (coursesData.courses[id].code || id).toUpperCase().replace(/[\s\u00A0-]/g, "");
      }

      // 2. Find in coursesData by ID or Code
      const course = Object.values(coursesData?.courses || {}).find(
        (c) =>
          String(c.id) === id ||
          (c.code && c.code.toUpperCase().replace(/[\s\u00A0-]/g, "") === normalizedInput)
      );
      if (course?.code) return course.code.toUpperCase().replace(/[\s\u00A0-]/g, "");

      // 3. Check Custom (Class) Courses
      const custom = classCourses?.find(
        (cc) =>
          cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "") === normalizedInput
      );
      if (custom) return custom.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");

      // 4. Fallback to attendanceData courses
      const altCourse = attendanceData?.courses?.[id];
      return (altCourse?.code ?? id).toUpperCase().replace(/[\s\u00A0-]/g, "");
    },
    [attendanceData, coursesData, classCourses]
  );

  const getCourseNameById = useCallback(
    (id: string): string => {
      const normalizedInput = id.trim().toUpperCase().replace(/[\s\u00A0-]/g, "");

      // 1. Direct hit in coursesData
      if (coursesData?.courses?.[id]) {
        return coursesData.courses[id].name || id;
      }

      // 2. Find in coursesData by ID or Code
      const course = Object.values(coursesData?.courses || {}).find(
        (c) =>
          String(c.id) === id ||
          (c.code && c.code.toUpperCase().replace(/[\s\u00A0-]/g, "") === normalizedInput)
      );
      if (course?.name) return course.name;

      // 3. Check Custom (Class) Courses
      const custom = classCourses?.find(
        (cc) =>
          cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "") === normalizedInput
      );
      if (custom) return custom.course_name || custom.course_code;

      // 4. Fallback to attendanceData courses
      const altCourse = attendanceData?.courses?.[id];
      return altCourse?.name ?? id;
    },
    [attendanceData, coursesData, classCourses]
  );

  return {
    getCourseCodeById,
    getCourseNameById,
  };
}
