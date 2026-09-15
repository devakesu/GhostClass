import { describe, expect, it } from "vitest";
import { hasAcademicRollover, semestersDiffer, yearsDiffer } from "../academic";

describe("Academic Rollover & Context Normalization", () => {
  describe("yearsDiffer", () => {
    it("returns false for null or undefined years", () => {
      expect(yearsDiffer(null, null)).toBe(false);
      expect(yearsDiffer("2025-2026", null)).toBe(false);
      expect(yearsDiffer(undefined, "2025-2026")).toBe(false);
    });

    it("returns false for identical year strings", () => {
      expect(yearsDiffer("2025-2026", "2025-2026")).toBe(false);
      expect(yearsDiffer(" 2025-2026 ", "2025-2026")).toBe(false);
    });

    it("normalizes short and full year formats (e.g. 2025-2026 vs 25-26 vs 2025-26)", () => {
      expect(yearsDiffer("2025-2026", "25-26")).toBe(false);
      expect(yearsDiffer("25-26", "2025-2026")).toBe(false);
      expect(yearsDiffer("2025-26", "2025-2026")).toBe(false);
      expect(yearsDiffer("2024-2025", "24-25")).toBe(false);
    });

    it("returns true when academic years genuinely differ", () => {
      expect(yearsDiffer("2024-2025", "2025-2026")).toBe(true);
      expect(yearsDiffer("24-25", "25-26")).toBe(true);
      expect(yearsDiffer("2023-2024", "2025-2026")).toBe(true);
    });
  });

  describe("semestersDiffer", () => {
    it("returns false for null or undefined semesters", () => {
      expect(semestersDiffer(null, null)).toBe(false);
      expect(semestersDiffer("even", null)).toBe(false);
      expect(semestersDiffer(undefined, "odd")).toBe(false);
    });

    it("compares semesters case-insensitively with whitespace trimming", () => {
      expect(semestersDiffer("even", "EVEN")).toBe(false);
      expect(semestersDiffer(" odd ", "ODD")).toBe(false);
    });

    it("normalizes numeric and word representations (e.g. '1' vs 'odd', '2' vs 'even')", () => {
      expect(semestersDiffer("1", "odd")).toBe(false);
      expect(semestersDiffer("2", "even")).toBe(false);
      expect(semestersDiffer("odd", "1")).toBe(false);
      expect(semestersDiffer("even", "2")).toBe(false);
    });

    it("returns true when semesters genuinely differ", () => {
      expect(semestersDiffer("even", "odd")).toBe(true);
      expect(semestersDiffer("1", "2")).toBe(true);
      expect(semestersDiffer("odd", "2")).toBe(true);
    });
  });

  describe("hasAcademicRollover", () => {
    it("returns false when both semester and year match", () => {
      expect(
        hasAcademicRollover(
          { semester: "even", year: "2025-2026" },
          { semester: "EVEN", year: "25-26" },
        ),
      ).toBe(false);
    });

    it("returns true if semester rolled over", () => {
      expect(
        hasAcademicRollover(
          { semester: "odd", year: "2025-2026" },
          { semester: "even", year: "2025-2026" },
        ),
      ).toBe(true);
    });

    it("returns true if year rolled over", () => {
      expect(
        hasAcademicRollover(
          { semester: "even", year: "2024-2025" },
          { semester: "even", year: "2025-2026" },
        ),
      ).toBe(true);
    });
  });
});
