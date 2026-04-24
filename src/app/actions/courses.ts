"use server";

import { logger } from "@/lib/logger";

export async function addCourseAction(formData: FormData): Promise<{ error?: string }> {
  const code = String(formData.get("courseCode") ?? "").trim();
  const title = String(formData.get("courseTitle") ?? "").trim();

  if (!code || !title) {
    return { error: "Course code and title are required" };
  }

  try {
    // Compatibility action: endpoint is expected to exist in backend proxy.
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/backend/institutionuser/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_code: code, course_name: title }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: body || "Failed to add course" };
    }

    return {};
  } catch (error) {
    logger.error("addCourseAction failed", error);
    return { error: "Failed to add course" };
  }
}
