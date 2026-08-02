import { describe, expect, it } from "vitest";
import {
  getDutyLeaveErrorMessage,
  isDutyLeaveConstraintError,
} from "@/lib/error-handling";

/**
 * Test suite for duty leave constraint error detection
 * Validates the error handling logic for database constraint P0001
 */
describe("Duty Leave Constraint Error Handling", () => {
  describe("isDutyLeaveConstraintError", () => {
    it("should correctly identify P0001 error with duty leave hint", () => {
      const error = {
        code: "P0001",
        hint: "Only 5 duty leaves allowed per semester per course",
        message: "Maximum 5 Duty Leaves exceeded for course: 72329",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("should not match P0001 error with different hint", () => {
      const error = {
        code: "P0001",
        hint: "Some other constraint violation",
        message: "Different error",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(false);
    });

    it("should not match different error code", () => {
      const error = {
        code: "23505",
        hint: "Only 5 duty leaves allowed per semester per course",
        message: "Duplicate key violation",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(false);
    });

    it("should handle missing error properties gracefully", () => {
      const error: any = {
        message: "Some error",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(false);
    });

    it("should handle null error gracefully", () => {
      expect(isDutyLeaveConstraintError(null)).toBe(false);
    });

    it("should handle undefined error gracefully", () => {
      expect(isDutyLeaveConstraintError(undefined)).toBe(false);
    });

    it("should match P0001 error using message fallback when hint is missing", () => {
      const error = {
        code: "P0001",
        message: "Maximum 5 Duty Leaves exceeded for course: 12345",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("should match P0001 error when nested in details property", () => {
      const error = {
        details: {
          code: "P0001",
          hint: "Only 5 duty leaves allowed per semester per course",
          message: "Maximum 5 Duty Leaves exceeded for course: 72329",
        },
      };

      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("should still use message fallback when details is a non-object value", () => {
      const error = {
        code: "P0001",
        message: "Maximum 5 Duty Leaves exceeded for course: 72329",
        details: "Additional error context",
      };

      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });
  });

  describe("getDutyLeaveErrorMessage", () => {
    it("should extract course name from coursesData", () => {
      const courseId = "72329";
      const coursesData = {
        courses: {
          "72329": { name: "Computer Science" },
        },
      } as any;

      const message = getDutyLeaveErrorMessage(courseId, coursesData);

      expect(message).toBe(
        "Cannot add Duty Leave: Maximum of 5 duty leaves per semester exceeded for Computer Science",
      );
    });

    it("should fallback to course ID when course name not found", () => {
      const courseId = "12345";
      const coursesData: any = {
        courses: {},
      };

      const message = getDutyLeaveErrorMessage(courseId, coursesData);

      expect(message).toBe(
        "Cannot add Duty Leave: Maximum of 5 duty leaves per semester exceeded for course 12345",
      );
    });

    it("should fallback to course ID when coursesData is undefined", () => {
      const courseId = "12345";

      const message = getDutyLeaveErrorMessage(courseId);

      expect(message).toBe(
        "Cannot add Duty Leave: Maximum of 5 duty leaves per semester exceeded for course 12345",
      );
    });
  });
});
