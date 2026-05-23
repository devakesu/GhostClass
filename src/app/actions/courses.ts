"use server";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { courseCodeSchema, courseNameSchema } from "@/lib/validation/text";

export async function addCourseAction(formData: FormData): Promise<{ error?: string }> {
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
    return { error: parsed.error.issues[0]?.message ?? "Invalid course details" };
  }

  const { courseCode: code, courseName: name } = parsed.data;
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

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
      logger.warn("Turnstile verification failed for add course", { verifyData, code });
      return { error: "Security verification failed. Please try again." };
    }
  } catch (err) {
    logger.error("Turnstile verification exception in add course", err);
    Sentry.captureException(err, { tags: { type: "turnstile_verification_error", location: "actions/courses" } });
    return { error: "Security check failed. Please check your connection." };
  }

  // 2. Perform Database Insert
  try {
    const supabase = await createClient();
    
    // Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { error: "You must be logged in to add courses" };
    }

    // Get user's class context
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("class_id")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile?.class_id) {
      logger.error("Failed to fetch user class for course addition", profileError);
      return { error: "No class associated with your profile" };
    }

    // Insert into class_courses (shared curriculum for the class)
    const { error: insertError } = await supabase
      .from("class_courses")
      .insert({
        class_id: profile.class_id,
        course_code: code.toUpperCase().replace(/[\s\u00A0-]/g, ""),
        course_name: name,
        created_by: user.id
      });

    if (insertError) {
      // Check for unique constraint violation (duplicate course)
      if (insertError.code === "23505") {
        return { error: "This course is already in your class lineup." };
      }
      logger.error("Database insert failed for class_courses", insertError);
      Sentry.captureException(insertError, { tags: { type: "course_insert_error", location: "actions/courses" } });
      return { error: "Failed to add course to database" };
    }

    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    logger.error("addCourseAction failed with exception", error);
    Sentry.captureException(error, { tags: { type: "course_action_error", location: "actions/courses" } });
    return { error: "An unexpected error occurred while adding course" };
  }
}
