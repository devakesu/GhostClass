"use server";

import { logger } from "@/lib/logger";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { getAuthenticatedUserContext } from "@/lib/security/auth-server";
import { validateCsrfToken } from "@/lib/security/csrf";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { courseCodeSchema, personNameSchema } from "@/lib/validation/text";
import { normalizeCourseCode } from "@/lib/utils";

export async function upsertInstructorAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const courseCodeValue = formData.get("courseCode");
  const instructorNameValue = formData.get("instructorName");

  if (
    typeof courseCodeValue !== "string" || courseCodeValue.trim() === "" ||
    typeof instructorNameValue !== "string" || instructorNameValue.trim() === ""
  ) {
    return { error: "Course code and instructor name are required" };
  }

  // Strict sanitization: Trim all inputs, capitalize and strip spaces from code, title case the name.
  const parsed = z.object({
    courseCode: courseCodeSchema,
    instructorName: personNameSchema,
  }).safeParse({
    courseCode: courseCodeValue,
    instructorName: instructorNameValue,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid instructor details",
    };
  }

  const { courseCode, instructorName } = parsed.data;
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const csrfToken = String(
    formData.get("csrf_token") ?? formData.get("csrfToken") ?? "",
  );

  // 1. Validate CSRF Token if present in form payload
  if (csrfToken) {
    const csrfValid = await validateCsrfToken(csrfToken);
    if (!csrfValid) {
      logger.warn("Invalid CSRF token in instructor update submission");
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

  // 2. Perform Database Update
  try {
    const contextRes = await getAuthenticatedUserContext(
      "You must be logged in to update instructors",
      "Failed to fetch user class for instructor update",
    );
    if (!contextRes.success) {
      return { error: contextRes.error };
    }
    const { user, classId, supabase } = contextRes;

    // Upsert into course_instructors (communal mapping shared by the class)
    const { error: upsertError } = await (supabase as {
      from: (t: string) => {
        upsert: (
          d: Record<string, unknown>,
          opt?: { onConflict?: string },
        ) => Promise<{ error: { code: string; message: string } | null }>;
      };
    })
      .from("course_instructors")
      .upsert({
        class_id: classId,
        course_code: normalizeCourseCode(courseCode),
        instructor_name: instructorName,
        updated_by: user.id,
      }, {
        onConflict: "class_id, course_code",
      });

    if (upsertError) {
      logger.error(
        "Database upsert failed for course_instructors",
        upsertError,
      );
      Sentry.captureException(upsertError, {
        tags: {
          type: "instructor_upsert_error",
          location: "actions/instructors",
        },
      });
      return { error: "Failed to save instructor to database" };
    }

    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    logger.error("upsertInstructorAction failed with exception", error);
    Sentry.captureException(error, {
      tags: {
        type: "instructor_action_error",
        location: "actions/instructors",
      },
    });
    return { error: "An unexpected error occurred while saving" };
  }
}
