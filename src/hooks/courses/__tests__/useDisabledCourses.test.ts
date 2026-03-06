import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDisabledCourses, makeSemesterKey } from "../useDisabledCourses";

const mockUpdateDisabledCourses = vi.fn();

vi.mock("@/providers/user-settings", () => ({
  useUserSettings: vi.fn(() => ({
    settings: {
      bunk_calculator_enabled: true,
      target_percentage: 75,
      disabled_courses: {
        "2025-2026-even": { CS101: "Challenge passed" },
      },
    },
    isLoading: false,
    updateBunkCalc: vi.fn(),
    updateTarget: vi.fn(),
    updateDisabledCourses: mockUpdateDisabledCourses,
  })),
}));

describe("makeSemesterKey", () => {
  it("returns null when academic year is missing", () => {
    expect(makeSemesterKey(null, "even")).toBeNull();
    expect(makeSemesterKey(undefined, "even")).toBeNull();
  });

  it("returns null when semester is missing", () => {
    expect(makeSemesterKey("2025-2026", null)).toBeNull();
    expect(makeSemesterKey("2025-2026", undefined)).toBeNull();
  });

  it("returns formatted key", () => {
    expect(makeSemesterKey("2025-2026", "even")).toBe("2025-2026-even");
    expect(makeSemesterKey("2024-25", "odd")).toBe("2024-25-odd");
  });
});

describe("useDisabledCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled codes for current semester", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "even" })
    );
    expect(result.current.disabledCodes.has("CS101")).toBe(true);
    expect(result.current.disabledCodes.size).toBe(1);
  });

  it("isDisabled returns true for disabled course (case-insensitive)", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "even" })
    );
    expect(result.current.isDisabled("CS101")).toBe(true);
    expect(result.current.isDisabled("cs101")).toBe(true);
    expect(result.current.isDisabled("CS102")).toBe(false);
  });

  it("getDisableReason returns the reason", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "even" })
    );
    expect(result.current.getDisableReason("CS101")).toBe("Challenge passed");
    expect(result.current.getDisableReason("CS102")).toBeNull();
  });

  it("returns empty set for different semester", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "odd" })
    );
    expect(result.current.disabledCodes.size).toBe(0);
    expect(result.current.isDisabled("CS101")).toBe(false);
  });

  it("returns empty set when semester or year is null", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: null, semester: null })
    );
    expect(result.current.disabledCodes.size).toBe(0);
  });

  it("disableCourse calls updateDisabledCourses with correct map", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "even" })
    );

    await act(async () => {
      await result.current.disableCourse("CS202", "Other reason");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({
      "2025-2026-even": {
        CS101: "Challenge passed",
        CS202: "Other reason",
      },
    });
  });

  it("enableCourse removes course from map", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2025-2026", semester: "even" })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    // Entire semester bucket should be removed since it becomes empty
    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({});
  });

  it("enableCourse is a no-op when semester key is null", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: null, semester: null })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    expect(mockUpdateDisabledCourses).not.toHaveBeenCalled();
  });

  it("disableCourse is a no-op when semester key is null", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: null, semester: null })
    );

    await act(async () => {
      await result.current.disableCourse("CS101", "reason");
    });

    expect(mockUpdateDisabledCourses).not.toHaveBeenCalled();
  });
});
