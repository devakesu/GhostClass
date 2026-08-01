import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCurrentAcademicInfo } from "../academic";

describe("calculateCurrentAcademicInfo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns provided metadata if valid", () => {
    const metadata = { year: "2023-24", semester: "Odd" };
    expect(calculateCurrentAcademicInfo(metadata)).toEqual({
      current_semester: "odd",
      current_year: "2023-24",
    });

    const metadata2 = { year: "2023-24", semester: "2" };
    expect(calculateCurrentAcademicInfo(metadata2)).toEqual({
      current_semester: "even",
      current_year: "2023-24",
    });
  });

  it("falls back to current date if metadata is missing or invalid", () => {
    // Mock July 2024 (Odd semester start)
    vi.setSystemTime(new Date(2024, 6, 15)); // July is month 6
    expect(calculateCurrentAcademicInfo()).toEqual({
      current_semester: "odd",
      current_year: "2024-25",
    });

    // Mock March 2025 (Even semester)
    vi.setSystemTime(new Date(2025, 2, 15)); // March is month 2
    expect(calculateCurrentAcademicInfo({})).toEqual({
      current_semester: "even",
      current_year: "2024-25",
    });
  });

  it("should handle numeric semester strings", () => {
    expect(calculateCurrentAcademicInfo({ year: "2023-24", semester: "1" }))
      .toEqual({
        current_year: "2023-24",
        current_semester: "odd",
      });
    expect(calculateCurrentAcademicInfo({ year: "2023-24", semester: "2" }))
      .toEqual({
        current_year: "2023-24",
        current_semester: "even",
      });
  });

  it("should detect semester based on date when metadata is partial or invalid", () => {
    // Test July (Odd)
    vi.setSystemTime(new Date(2023, 6, 1)); // July 1st
    expect(calculateCurrentAcademicInfo()).toEqual({
      current_year: "2023-24",
      current_semester: "odd",
    });

    // Test January (Even)
    vi.setSystemTime(new Date(2024, 0, 1)); // Jan 1st
    expect(calculateCurrentAcademicInfo()).toEqual({
      current_year: "2023-24",
      current_semester: "even",
    });
  });

  it("should fallback to date when metadata semester is invalid", () => {
    vi.setSystemTime(new Date(2023, 6, 1));
    expect(
      calculateCurrentAcademicInfo({ year: "2023-24", semester: "invalid" }),
    ).toEqual({
      current_year: "2023-24",
      current_semester: "odd",
    });
  });

  it("handles normalized semester cases", () => {
    expect(
      calculateCurrentAcademicInfo({ year: "2024-25", semester: "1" })
        .current_semester,
    ).toBe("odd");
    expect(
      calculateCurrentAcademicInfo({ year: "2024-25", semester: "2" })
        .current_semester,
    ).toBe("even");
    expect(
      calculateCurrentAcademicInfo({ year: "2024-25", semester: "random" })
        .current_semester,
    ).toBeDefined(); // Fallback
  });
});
