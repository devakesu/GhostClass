"use client";

import { useCallback } from "react";
import { normalizeCourseCode } from "@/lib/utils";
import { Course } from "@/types";

interface UseCourseLookupProps {
  coursesData?: { courses: Record<string, Course> } | null;
  classCourses?: Array<{ course_code?: string; course_name?: string }> | null;
  attendanceData?: { courses?: Record<string, { code?: string; name?: string }> } | null;
}

export function useCourseLookup({
  coursesData,
  classCourses,
  attendanceData,
}: UseCourseLookupProps) {
  const normalize = (s?: string) => normalizeCourseCode(s);

  const getCourseCodeById = useCallback(
    (id: string): string => {
      const normalizedInput = normalize(id);

      // 1. Direct hit in coursesData
      const courses = coursesData?.courses;
      if (courses && Object.prototype.hasOwnProperty.call(courses, id)) {
        return normalize(Reflect.get(courses, id)?.code || id);
      }

      // 2. Find in coursesData by ID or Code
      const course = Object.values(courses || {}).find(
        (c) =>
          String(c.id) === id || (c.code && normalize(c.code) === normalizedInput)
      );
      if (course?.code) return normalize(course.code);

      // 3. Check Custom (Class) Courses
      const custom = classCourses?.find(
        (cc) =>
          typeof cc.course_code === "string" &&
          normalize(cc.course_code) === normalizedInput
      );
      if (custom?.course_code) return normalize(custom.course_code);

      // 4. Fallback to attendanceData courses
      const altCourses = attendanceData?.courses;
      const hasAlt =
        altCourses &&
        typeof altCourses === "object" &&
        Object.prototype.hasOwnProperty.call(altCourses, id);

      const altCourse = hasAlt ? Reflect.get(altCourses, id) : undefined;
      return normalize(altCourse?.code ?? id);
    },
    [attendanceData, coursesData, classCourses]
  );

  const getCourseNameById = useCallback(
    (id: string): string => {
      const normalizedInput = normalize(id);

      // 1. Direct hit in coursesData
      const courses = coursesData?.courses;
      if (courses && Object.prototype.hasOwnProperty.call(courses, id)) {
        return Reflect.get(courses, id)?.name || id;
      }

      // 2. Find in coursesData by ID or Code
      const course = Object.values(courses || {}).find(
        (c) =>
          String(c.id) === id || (c.code && normalize(c.code) === normalizedInput)
      );
      if (course?.name) return course.name;

      // 3. Check Custom (Class) Courses
      const custom = classCourses?.find(
        (cc) =>
          typeof cc.course_code === "string" &&
          normalize(cc.course_code) === normalizedInput
      );
      if (custom) return custom.course_name || custom.course_code || id;

      // 4. Fallback to attendanceData courses
      const altCourses = attendanceData?.courses;
      const hasAlt =
        altCourses &&
        typeof altCourses === "object" &&
        Object.prototype.hasOwnProperty.call(altCourses, id);

      const altCourse = hasAlt ? Reflect.get(altCourses, id) : undefined;
      return altCourse?.name ?? id;
    },
    [attendanceData, coursesData, classCourses]
  );

  return {
    getCourseCodeById,
    getCourseNameById,
  };
}
