import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCourseLookup } from "../useCourseLookup";

describe("useCourseLookup", () => {
  const mockCoursesData = {
    courses: {
      "1": { id: 1, code: "CS101", name: "Intro to CS" },
      "2": { id: 2, code: "MA101", name: "Calculus" },
    },
  };

  const mockClassCourses = [
    { course_code: "CUSTOM1", course_name: "Custom Course" },
  ];

  const mockAttendanceData = {
    courses: {
      "3": { id: 3, code: "PH101", name: "Physics" },
    },
  };

  it("should get course code by ID from coursesData", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ coursesData: mockCoursesData })
    );
    expect(result.current.getCourseCodeById("1")).toBe("CS101");
  });

  it("should find course code by normalized code input", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ coursesData: mockCoursesData })
    );
    expect(result.current.getCourseCodeById(" cs 101 ")).toBe("CS101");
  });

  it("should get course code from classCourses", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ classCourses: mockClassCourses })
    );
    expect(result.current.getCourseCodeById("CUSTOM1")).toBe("CUSTOM1");
  });

  it("should fallback to attendanceData for course code", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ attendanceData: mockAttendanceData })
    );
    expect(result.current.getCourseCodeById("3")).toBe("PH101");
  });

  it("should return uppercase id if no course found", () => {
    const { result } = renderHook(() => useCourseLookup({}));
    expect(result.current.getCourseCodeById("unknown")).toBe("UNKNOWN");
  });

  it("should get course name by ID from coursesData", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ coursesData: mockCoursesData })
    );
    expect(result.current.getCourseNameById("1")).toBe("Intro to CS");
  });

  it("should find course name by normalized code input", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ coursesData: mockCoursesData })
    );
    expect(result.current.getCourseNameById(" cs 101 ")).toBe("Intro to CS");
  });

  it("should get course name from classCourses", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ classCourses: mockClassCourses })
    );
    expect(result.current.getCourseNameById("CUSTOM1")).toBe("Custom Course");
  });

  it("should handle classCourses with missing name", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ classCourses: [{ course_code: "NONAME" }] })
    );
    expect(result.current.getCourseNameById("NONAME")).toBe("NONAME");
  });

  it("should fallback to attendanceData for course name", () => {
    const { result } = renderHook(() =>
      useCourseLookup({ attendanceData: mockAttendanceData })
    );
    expect(result.current.getCourseNameById("3")).toBe("Physics");
  });

  it("should return id if no name found", () => {
    const { result } = renderHook(() => useCourseLookup({}));
    expect(result.current.getCourseNameById("unknown")).toBe("unknown");
  });
});
