"use server";

import { logger } from "@/lib/logger";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { getAuthenticatedUserContext } from "@/lib/security/auth-server";
import { validateCsrfToken } from "@/lib/security/csrf";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { courseCodeSchema, courseNameSchema } from "@/lib/validation/text";
import { normalizeCourseCode } from "@/lib/utils";

export async function addCourseAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const courseCodeValue = formData.get("courseCode");
  const courseNameValue = formData.get("courseName");

  if (
    typeof courseCodeValue !== "string" || courseCodeValue.trim() === "" ||
    typeof courseNameValue !== "string" || courseNameValue.trim() === ""
  ) {
    return { error: "Course code and name are required" };
  }

  // Strict sanitization: Trim all inputs, capitalize and strip spaces from code, title case the name.
  const parsed = z.object({
    courseCode: courseCodeSchema,
    courseName: courseNameSchema,
  }).safeParse({
    courseCode: courseCodeValue,
    courseName: courseNameValue,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid course details",
    };
  }

  const { courseCode: code, courseName: name } = parsed.data;
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const csrfToken = String(
    formData.get("csrf_token") ?? formData.get("csrfToken") ?? "",
  );

  // 1. Validate CSRF Token if present in form payload
  if (csrfToken) {
    const csrfValid = await validateCsrfToken(csrfToken);
    if (!csrfValid) {
      logger.warn("Invalid CSRF token in add course submission");
      return { error: "Invalid security token. Please refresh and try again." };
    }
  }

  // 2. Verify Turnstile Security Token
  const turnstileRes = await verifyTurnstile(
    turnstileToken,
    "Security verification failed. Please try again.",
  );
  if (!turnstileRes.success) {
    return { error: turnstileRes.error };
  }

  // 2. Perform Database Insert
  try {
    const contextRes = await getAuthenticatedUserContext(
      "You must be logged in to add courses",
      "Failed to fetch user class for course addition",
    );
    if (!contextRes.success) {
      return { error: contextRes.error };
    }
    const { user, classId, supabase } = contextRes;

    // Insert into class_courses (shared curriculum for the class)
    const { error: insertError } = await (supabase as {
      from: (t: string) => {
        insert: (d: Record<string, unknown>) => Promise<{
          error: { code: string; message: string } | null;
        }>;
      };
    })
      .from("class_courses")
      .insert({
        class_id: classId,
        course_code: normalizeCourseCode(code),
        course_name: name,
        created_by: user.id,
      });

    if (insertError) {
      // Check for unique constraint violation (duplicate course)
      if (insertError.code === "23505") {
        return { error: "This course is already in your class lineup." };
      }
      logger.error("Database insert failed for class_courses", insertError);
      Sentry.captureException(insertError, {
        tags: { type: "course_insert_error", location: "actions/courses" },
      });
      return { error: "Failed to add course to database" };
    }

    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    logger.error("addCourseAction failed with exception", error);
    Sentry.captureException(error, {
      tags: { type: "course_action_error", location: "actions/courses" },
    });
    return { error: "An unexpected error occurred while adding course" };
  }
}
