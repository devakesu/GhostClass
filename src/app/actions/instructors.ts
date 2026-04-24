"use server";

import { logger } from "@/lib/logger";

export async function upsertInstructorAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const courseCode = String(formData.get("courseCode") ?? "").trim();
  const instructorName = String(formData.get("instructorName") ?? "").trim();

  if (!courseCode || !instructorName) {
    return { error: "Course code and instructor name are required" };
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/backend/institutionuser/courses/instructors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_code: courseCode, instructor_name: instructorName }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: body || "Failed to save instructor" };
    }

    return {};
  } catch (error) {
    logger.error("upsertInstructorAction failed", error);
    return { error: "Failed to save instructor" };
  }
}
