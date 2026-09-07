import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardStats } from "../use-dashboard-stats";

describe("useDashboardStats", () => {
  const mockCoursesData = {
    courses: {
      "1": { code: "CS101" },
      "2": { code: "CS102" },
    },
  };

  const mockAttendanceData = {
    studentAttendanceData: {
      "2023-10-01": {
        "1": { course: "1", attendance: 110, class_type: "Theory" }, // Present
        "2": { course: "2", attendance: 111, class_type: "Theory" }, // Absent
      },
    },
  };

  const mockTrackingData = [
    {
      course: "1",
      date: "2023-10-01",
      session: "1",
      attendance: 110,
      semester: "1",
      year: "2023",
      status: "original",
    },
    {
      course: "1",
      date: "2023-10-02",
      session: "1",
      attendance: 110,
      semester: "1",
      year: "2023",
      status: "extra",
    },
  ];

  const mockClassCourses = [
    { course_code: "CS101" },
    { course_code: "CS103" },
  ];

  it("calculates basic statistics correctly", () => {
    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: mockAttendanceData as any,
        trackingData: [] as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    expect(result.current.realPresent).toBe(1);
    expect(result.current.realTotal).toBe(2);
    expect(result.current.percentage).toBe(50);
  });

  it("handles extra classes from tracking data", () => {
    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: mockAttendanceData as any,
        trackingData: mockTrackingData as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    // Initial: 1/2
    // Extra: 1/1
    // Total: 2/3
    expect(result.current.finalTotal).toBe(3);
    expect(result.current.finalPresent).toBe(2);
    expect(result.current.extraPresent).toBe(1);
    expect(result.current.percentage).toBe(66.67);
  });

  it("handles disabled course codes", () => {
    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: mockAttendanceData as any,
        trackingData: [] as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(["CS101"]),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    // CS101 is present (1/1) but disabled.
    // CS102 is absent (0/1) and enabled.
    expect(result.current.realPresent).toBe(0);
    expect(result.current.realTotal).toBe(1);
    expect(result.current.percentage).toBe(0);
  });

  it("handles corrections (reconciliation)", () => {
    const trackingWithCorrection = [
      {
        course: "2", // Originally absent (111) in session 2
        date: "2023-10-01",
        session: "2",
        attendance: 110, // Changed to present
        semester: "1",
        year: "2023",
        status: "correction",
      },
    ];

    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: mockAttendanceData as any,
        trackingData: trackingWithCorrection as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    // Initial: 1/2
    // Correction: +1 present
    expect(result.current.finalPresent).toBe(2);
    expect(result.current.correctionPresent).toBe(1);
    expect(result.current.percentage).toBe(100);
  });

  it("returns zero when no data is available", () => {
    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: undefined,
        attendanceData: undefined,
        trackingData: undefined,
        classCourses: undefined,
        disabledCodes: new Set(),
        selectedSemester: null,
        selectedYear: null,
      })
    );

    expect(result.current.percentage).toBe(0);
    expect(result.current.finalTotal).toBe(0);
  });

  it("ignores orphaned corrections targeting non-existent official sessions", () => {
    const orphanedCorrection = [
      {
        course: "CS101",
        date: "2023-10-05", // No official class on this date
        session: "II",
        attendance: 225, // Duty leave
        semester: "1",
        year: "2023",
        status: "correction",
      },
    ];

    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: mockAttendanceData as any,
        trackingData: orphanedCorrection as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    // Initial is 1/2 (50%). Orphaned correction must NOT grant free present or alter stats
    expect(result.current.finalPresent).toBe(1);
    expect(result.current.correctionPresent).toBe(0);
    expect(result.current.percentage).toBe(50);
  });

  it("handles EzyGo numeric session IDs > 20 and matches with Roman numeral tracking records", () => {
    const ezygoAttendanceData = {
      studentAttendanceData: {
        "2023-10-01": {
          "219": { course: "1", attendance: 111, class_type: "Theory" }, // Absent in 1st hour
          "220": { course: "1", attendance: 111, class_type: "Theory" }, // Absent in 2nd hour
        },
      },
    };

    const trackingData = [
      {
        course: "CS101",
        date: "2023-10-01",
        session: "I", // Roman numeral for 1st hour (219)
        attendance: 225,
        semester: "1",
        year: "2023",
        status: "correction",
      },
      {
        course: "CS101",
        date: "2023-10-01",
        session: "II", // Roman numeral for 2nd hour (220)
        attendance: 225,
        semester: "1",
        year: "2023",
        status: "correction",
      },
    ];

    const { result } = renderHook(() =>
      useDashboardStats({
        coursesData: mockCoursesData,
        attendanceData: ezygoAttendanceData as any,
        trackingData: trackingData as any,
        classCourses: mockClassCourses,
        disabledCodes: new Set(),
        selectedSemester: "1",
        selectedYear: "2023",
      })
    );

    // Both absents corrected to DL
    expect(result.current.realPresent).toBe(0);
    expect(result.current.realAbsent).toBe(2);
    expect(result.current.realTotal).toBe(2);
    expect(result.current.correctionPresent).toBe(2);
    expect(result.current.savedAbsent).toBe(2);
    expect(result.current.finalPresent).toBe(2);
    expect(result.current.finalTotal).toBe(2);
    expect(result.current.percentage).toBe(100);
  });
});
