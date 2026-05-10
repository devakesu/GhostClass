"use server";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { toTitleCase } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

export async function upsertInstructorAction(
  formData: FormData,
): Promise<{ error?: string }> {
  // Strict sanitization: Trim all inputs, capitalize and strip spaces from code, title case the name.
  const courseCode = String(formData.get("courseCode") ?? "").trim().toUpperCase().replace(/[\s\u00A0-]/g, "");
  const instructorName = toTitleCase(String(formData.get("instructorName") ?? ""));
  const semester = String(formData.get("semester") ?? "").trim();
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

  if (!courseCode || !instructorName) {
    return { error: "Course code and instructor name are required" };
  }

  // 1. Verify Turnstile Security Token
  if (!turnstileToken) {
    return { error: "Security verification failed. Please refresh." };
  }

  try {
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${turnstileToken}`,
      }
    );
    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      logger.warn("Turnstile verification failed", { verifyData, courseCode });
      return { error: "Security verification failed. Please try again." };
    }
  } catch (err) {
    logger.error("Turnstile verification exception", err);
    Sentry.captureException(err, { tags: { type: "turnstile_verification_error", location: "actions/instructors" } });
    return { error: "Security check failed. Please check your connection." };
  }

  // 2. Perform Database Update
  try {
    const supabase = await createClient();
    
    // Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { error: "You must be logged in to update instructors" };
    }

    // Get user's class context from the 'users' table (aliased as profile in types)
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("class_id")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile?.class_id) {
      logger.error("Failed to fetch user class for instructor update", profileError);
      return { error: "No class associated with your profile" };
    }

    // Upsert into course_instructors (communal mapping shared by the class)
    const { error: upsertError } = await supabase
      .from("course_instructors")
      .upsert({
        class_id: profile.class_id,
        course_code: courseCode.toUpperCase().replace(/[\s\u00A0-]/g, ""),
        instructor_name: instructorName,
        semester,
        academic_year: academicYear,
        updated_by: user.id
      }, {
        onConflict: "class_id, course_code, semester, academic_year"
      });

    if (upsertError) {
      logger.error("Database upsert failed for course_instructors", upsertError);
      Sentry.captureException(upsertError, { tags: { type: "instructor_upsert_error", location: "actions/instructors" } });
      return { error: "Failed to save instructor to database" };
    }

    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    logger.error("upsertInstructorAction failed with exception", error);
    Sentry.captureException(error, { tags: { type: "instructor_action_error", location: "actions/instructors" } });
    return { error: "An unexpected error occurred while saving" };
  }
}
