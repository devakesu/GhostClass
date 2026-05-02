import { describe, it, expect } from "vitest";
import { getHumanReadableError, isDutyLeaveConstraintError, getDutyLeaveErrorMessage, DB_CONSTRAINTS } from "../error-handling";

describe("error-handling.ts", () => {
  describe("getHumanReadableError", () => {
    it("returns default message if error is null", () => {
      expect(getHumanReadableError(null, "action")).toBe("Failed to complete action");
      expect(getHumanReadableError(undefined)).toBe("Failed to complete operation");
    });

    it("handles RLS violations", () => {
      const error = { code: "42501", message: "new row violates row-level security policy" };
      expect(getHumanReadableError(error)).toBe("You don't have permission to perform this action.");
      expect(getHumanReadableError(error, "adding course")).toBe("You don't have permission to add courses to this class. Ensure your profile sync is complete.");
      expect(getHumanReadableError(error, "attendance")).toBe("Permission denied. You can only modify your own attendance records.");
      
      const errorNoCode = { message: "row-level security violation" };
      expect(getHumanReadableError(errorNoCode)).toBe("You don't have permission to perform this action.");
    });

    it("handles unique constraint violations", () => {
      const error = { code: "23505" };
      expect(getHumanReadableError(error)).toBe("This record already exists.");
      expect(getHumanReadableError(error, "adding course")).toBe("This course already exists in your class lineup for this semester.");
      expect(getHumanReadableError(error, "attendance")).toBe("A record already exists for this date and session.");
    });

    it("handles foreign key violations", () => {
      const error = { code: "23503" };
      expect(getHumanReadableError(error)).toBe("The related record was not found or has been deleted.");
    });

    it("handles data type mismatch", () => {
      const error = { code: "22P02" };
      expect(getHumanReadableError(error)).toBe("Invalid data format. Please check your input and try again.");
    });

    it("handles network errors", () => {
      expect(getHumanReadableError({ message: "failed to fetch" })).toBe("Connection failed. Please check your internet and try again.");
      expect(getHumanReadableError({ message: "Network Error" })).toBe("Connection failed. Please check your internet and try again.");
      expect(getHumanReadableError({ code: "ERR_NETWORK", message: "" })).toBe("Connection failed. Please check your internet and try again.");
    });

    it("handles circuit breaker/503 errors", () => {
      expect(getHumanReadableError({ status: 503, message: "" })).toBe("EzyGo servers are currently down. Please try again later.");
      expect(getHumanReadableError({ message: "technical issues" })).toBe("EzyGo servers are currently down. Please try again later.");
      expect(getHumanReadableError({ response: { status: 503 }, message: "" })).toBe("EzyGo servers are currently down. Please try again later.");
    });

    it("handles rate limiting", () => {
      expect(getHumanReadableError({ code: "429", message: "" })).toBe("Too many requests. Please wait a few moments and try again.");
      expect(getHumanReadableError({ status: 429, message: "" })).toBe("Too many requests. Please wait a few moments and try again.");
      expect(getHumanReadableError({ message: "too many requests" })).toBe("Too many requests. Please wait a few moments and try again.");
    });

    it("handles non-object errors", () => {
      expect(getHumanReadableError("some error")).toBe("Failed to complete operation");
    });

    it("returns message if no specific mapping found", () => {
      expect(getHumanReadableError({ message: "Something went wrong" })).toBe("Something went wrong");
    });
  });

  describe("isDutyLeaveConstraintError", () => {
    it("returns false for non-objects", () => {
      expect(isDutyLeaveConstraintError(null)).toBe(false);
      expect(isDutyLeaveConstraintError("error")).toBe(false);
    });

    it("detects direct match", () => {
      const error = {
        code: DB_CONSTRAINTS.DUTY_LEAVE_CODE,
        hint: DB_CONSTRAINTS.DUTY_LEAVE_LIMIT
      };
      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("detects nested match", () => {
      const error = {
        details: {
          code: DB_CONSTRAINTS.DUTY_LEAVE_CODE,
          hint: DB_CONSTRAINTS.DUTY_LEAVE_LIMIT
        }
      };
      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("detects fallback message match", () => {
      const error = {
        code: DB_CONSTRAINTS.DUTY_LEAVE_CODE,
        message: "Maximum Duty Leaves exceeded for this course"
      };
      expect(isDutyLeaveConstraintError(error)).toBe(true);
    });

    it("returns false for non-matching errors", () => {
      expect(isDutyLeaveConstraintError({ code: "OTHER" })).toBe(false);
      expect(isDutyLeaveConstraintError({ code: DB_CONSTRAINTS.DUTY_LEAVE_CODE, message: "wrong message" })).toBe(false);
    });
  });

  describe("getDutyLeaveErrorMessage", () => {
    it("uses course name if available", () => {
      const coursesData = {
        courses: {
          "123": { id: "123", name: "CS101", code: "CS101", slug: "cs101" } as any
        }
      };
      expect(getDutyLeaveErrorMessage("123", coursesData)).toContain("exceeded for CS101");
    });

    it("uses course id if name not available", () => {
      expect(getDutyLeaveErrorMessage("456")).toContain("exceeded for course 456");
    });
  });

  describe("Edge cases", () => {
    it("handles error objects with non-string code/message", () => {
      // @ts-ignore
      const error = { code: 123, message: true };
      const result = getHumanReadableError(error);
      expect(result).toBe("Failed to complete operation");
    });

    it("handles duty leave check with non-matching details", () => {
      const error = { details: { code: "OTHER" } };
      expect(isDutyLeaveConstraintError(error)).toBe(false);
    });

    it("handles duty leave check with non-matching message", () => {
      const error = { code: DB_CONSTRAINTS.DUTY_LEAVE_CODE, message: "some other message" };
      expect(isDutyLeaveConstraintError(error)).toBe(false);
    });
  });
});
