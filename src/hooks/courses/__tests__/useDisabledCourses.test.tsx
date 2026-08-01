import { act, renderHook } from "@testing-library/react";
vi.unmock("@/hooks/courses/useDisabledCourses");
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSemesterKey, useDisabledCourses } from "../useDisabledCourses";
import { useUserSettings } from "@/providers/user-settings";

vi.mock("@/providers/user-settings", () => ({
  useUserSettings: vi.fn(),
}));

describe("useDisabledCourses", () => {
  const mockUpdateDisabledCourses = vi.fn();
  const mockSettings = {
    disabled_courses: {
      "2023-1": {
        CS101: "Already passed",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useUserSettings as any).mockReturnValue({
      settings: mockSettings,
      isLoading: false,
      updateDisabledCourses: mockUpdateDisabledCourses,
    });
  });

  describe("makeSemesterKey", () => {
    it("should create key from year and semester", () => {
      expect(makeSemesterKey("2023", "1")).toBe("2023-1");
    });

    it("should return null if parameters are missing", () => {
      expect(makeSemesterKey(null, "1")).toBeNull();
      expect(makeSemesterKey("2023", undefined)).toBeNull();
    });
  });

  it("should identify disabled courses", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );
    expect(result.current.isDisabled("CS101")).toBe(true);
    expect(result.current.isDisabled("MA101")).toBe(false);
  });

  it("should get disable reason", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );
    expect(result.current.getDisableReason("CS101")).toBe("Already passed");
    expect(result.current.getDisableReason("MA101")).toBeNull();
  });

  it("should return null for reason if semKey is null", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: null, semester: "1" })
    );
    expect(result.current.getDisableReason("CS101")).toBeNull();
  });

  it("should disable a course", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );

    await act(async () => {
      await result.current.disableCourse("MA101", "Testing");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({
      "2023-1": {
        CS101: "Already passed",
        MA101: "Testing",
      },
    });
  });

  it("should create a new semester bucket when disabling a course", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2024", semester: "2" })
    );

    await act(async () => {
      await result.current.disableCourse("PH101", "New Sem");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith(
      expect.objectContaining({
        "2024-2": { PH101: "New Sem" },
      }),
    );
  });

  it("should enable a course", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({});
  });

  it("should handle enabling non-existent course or semester", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2024", semester: "2" })
    );

    await act(async () => {
      await result.current.enableCourse("UNKNOWN");
    });

    expect(mockUpdateDisabledCourses).not.toHaveBeenCalled();
  });

  it("should return early if semKey is null during disable/enable", async () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: null, semester: "1" })
    );

    await act(async () => {
      await result.current.disableCourse("MA101", "X");
      await result.current.enableCourse("CS101");
    });

    expect(mockUpdateDisabledCourses).not.toHaveBeenCalled();
  });

  it("should handle missing settings or disabled_courses", () => {
    (useUserSettings as any).mockReturnValue({
      settings: null,
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );
    expect(result.current.disabledCoursesMap).toEqual({});
    expect(result.current.disabledCodes.size).toBe(0);
  });

  it("should return null reason if semester not in map", () => {
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2024", semester: "1" })
    );
    expect(result.current.getDisableReason("ANY")).toBeNull();
  });

  it("should enable a course and keep the semester bucket if other courses remain", async () => {
    (useUserSettings as any).mockReturnValue({
      settings: {
        disabled_courses: {
          "2023-1": {
            CS101: "Reason 1",
            MA101: "Reason 2",
          },
        },
      },
      isLoading: false,
      updateDisabledCourses: mockUpdateDisabledCourses,
    });
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({
      "2023-1": {
        MA101: "Reason 2",
      },
    });
  });

  it("should handle case-insensitive enablement", async () => {
    (useUserSettings as any).mockReturnValue({
      settings: {
        disabled_courses: {
          "2023-1": {
            "cs101": "Lower case key",
          },
        },
      },
      isLoading: false,
      updateDisabledCourses: mockUpdateDisabledCourses,
    });
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({});
  });

  it("should do nothing if enabling a course that is not disabled", async () => {
    (useUserSettings as any).mockReturnValue({
      settings: {
        disabled_courses: {
          "2023-1": {
            "MA101": "Other",
          },
        },
      },
      isLoading: false,
      updateDisabledCourses: mockUpdateDisabledCourses,
    });
    const { result } = renderHook(() =>
      useDisabledCourses({ academicYear: "2023", semester: "1" })
    );

    await act(async () => {
      await result.current.enableCourse("CS101");
    });

    // It still calls updateDisabledCourses with the same map because the code says:
    // await updateDisabledCourses(newMap);
    // and newMap was structuredClone of original.
    expect(mockUpdateDisabledCourses).toHaveBeenCalledWith({
      "2023-1": { "MA101": "Other" },
    });
  });
});
