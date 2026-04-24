/**
 * Error handling utilities for database constraint violations and other errors
 */

import { PostgrestError } from "@supabase/supabase-js";
import { Course } from "@/types";

/**
 * Centrally managed database constraint hints.
 * These must match the error hints defined in the Supabase/PostgreSQL schema.
 */
export const DB_CONSTRAINTS = {
  DUTY_LEAVE_LIMIT: "Only 5 duty leaves allowed per semester per course",
  DUTY_LEAVE_CODE: "P0001",
} as const;

/**
 * Database error structure returned by Supabase/PostgreSQL
 */
export interface DatabaseError {
  code?: string;
  hint?: string;
  message?: string;
}

function normalizeError(error: unknown): { code: string; message: string; status?: number } {
  if (!error || typeof error !== "object") {
    return { code: "", message: "" };
  }

  const pg = error as PostgrestError;
  const raw = error as Record<string, unknown>;

  return {
    code: typeof pg.code === "string" ? pg.code : typeof raw.code === "string" ? raw.code : "",
    message:
      typeof pg.message === "string"
        ? pg.message
        : typeof raw.message === "string"
          ? raw.message
          : "",
    status: typeof raw.status === "number" ? raw.status : undefined,
  };
}

/**
 * Maps Supabase/PostgreSQL errors to human-readable messages.
 * Keeps technical DB details out of user-facing UI.
 */
export function getHumanReadableError(error: unknown, context: string = "operation"): string {
  if (!error) return `Failed to complete ${context}`;

  const { code, message, status } = normalizeError(error);
  const lower = message.toLowerCase();

  // Row Level Security (RLS) violations
  if (code === "42501" || lower.includes("row-level security")) {
    if (context === "adding course") {
      return "You don't have permission to add courses to this class. Ensure your profile sync is complete.";
    }
    if (context === "attendance") {
      return "Permission denied. You can only modify your own attendance records.";
    }
    return "You don't have permission to perform this action.";
  }

  // Unique constraint violations
  if (code === "23505") {
    if (context === "adding course") {
      return "This course already exists in your class lineup for this semester.";
    }
    if (context === "attendance") {
      return "A record already exists for this date and session.";
    }
    return "This record already exists.";
  }

  // Foreign key violations
  if (code === "23503") {
    return "The related record was not found or has been deleted.";
  }

  // Data type / UUID mismatch
  if (code === "22P02") {
    return "Invalid data format. Please check your input and try again.";
  }

  // Network / timeout
  if (message.includes("fetch") || lower.includes("network")) {
    return "Connection failed. Please check your internet and try again.";
  }

  // Rate limiting
  if (code === "429" || lower.includes("too many requests") || status === 429) {
    return "Too many requests. Please wait a few moments and try again.";
  }

  // Fallback guard against leaking RLS details
  if (lower.includes("row-level security")) {
    return "Permission denied. Please verify your account settings.";
  }

  return message || `Failed to complete ${context}`;
}

/**
 * Checks if an error is a duty leave constraint violation (P0001 error with specific hint)
 * 
 * @param error - The error object to check
 * @returns true if the error is a duty leave constraint violation, false otherwise
 * 
 * @example
 * ```ts
 * const error = { code: 'P0001', hint: 'Only 5 duty leaves allowed per semester per course' };
 * if (isDutyLeaveConstraintError(error)) {
 *   // Handle duty leave constraint violation
 * }
 * ```
 */
export function isDutyLeaveConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  
  const errorObj = error as Record<string, unknown>;
  
  // Check direct error properties
  const isDirectMatch = (
    errorObj.code === DB_CONSTRAINTS.DUTY_LEAVE_CODE && 
    errorObj.hint === DB_CONSTRAINTS.DUTY_LEAVE_LIMIT
  );
  
  if (isDirectMatch) return true;
  
  // Check if error is wrapped in a details property or other nested structure
  if (errorObj.details && typeof errorObj.details === "object") {
    const details = errorObj.details as Record<string, unknown>;
    const isNestedMatch =
      details.code === DB_CONSTRAINTS.DUTY_LEAVE_CODE &&
      details.hint === DB_CONSTRAINTS.DUTY_LEAVE_LIMIT;

    if (isNestedMatch) {
      return true;
    }
  }
  
  // Check error message as fallback
  if (errorObj.message && typeof errorObj.message === 'string') {
    return errorObj.message.includes('Maximum') && 
           errorObj.message.includes('Duty Leaves exceeded') &&
           errorObj.code === DB_CONSTRAINTS.DUTY_LEAVE_CODE;
  }
  
  return false;
}

/**
 * Generates a user-friendly error message for duty leave constraint violations
 * 
 * @param courseId - The course ID
 * @param coursesData - The courses data object containing course information
 * @returns A user-friendly error message
 * 
 * @example
 * ```ts
 * const coursesData = { courses: { '123': { name: 'Computer Science' } } };
 * const message = getDutyLeaveErrorMessage('123', coursesData);
 * // Returns: "Cannot add Duty Leave: Maximum of 5 duty leaves per semester exceeded for Computer Science"
 * ```
 */
export function getDutyLeaveErrorMessage(
  courseId: string, 
  coursesData?: { courses: Record<string, Course> }
): string {
  const courseName = coursesData?.courses?.[courseId]?.name || `course ${courseId}`;
  return `Cannot add Duty Leave: Maximum of 5 duty leaves per semester exceeded for ${courseName}`;
}
