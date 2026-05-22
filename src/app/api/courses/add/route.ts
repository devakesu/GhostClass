import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { academicYearSchema, courseCodeSchema, personNameSchema, semesterSchema } from "@/lib/validation/text";

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (!token) return null;
    const supabaseAdmin = getAdminClient();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      logger.error("API Course Add: Bearer auth.getUser error:", error || "No user");
      return null;
    }
    return { user, supabase: supabaseAdmin };
  }

  const supabaseClient = await createClient();
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    logger.error("API Course Add: Client auth.getUser error:", error || "No user");
    return null;
  }
  return { user, supabase: supabaseClient };
}

/**
 * API Route for adding a new course to a class lineup.
 * Primarily used by the mobile app which bypasses the Turnstile check 
 * but uses JWE/AppCheck/PlayIntegrity for security.
 */
async function handler(req: Request, { decryptedBody }: { decryptedBody?: unknown }) {
  try {
    const body = decryptedBody || await req.json();
    const rawBody = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    const courseCodeValue = rawBody.courseCode;
    const courseNameValue = rawBody.courseName;
    const semesterValue = rawBody.semester;
    const academicYearValue = rawBody.academicYear;

    if (
      typeof courseCodeValue !== "string" || courseCodeValue.trim() === "" ||
      typeof courseNameValue !== "string" || courseNameValue.trim() === "" ||
      typeof semesterValue !== "string" || semesterValue.trim() === "" ||
      typeof academicYearValue !== "string" || academicYearValue.trim() === ""
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const parsed = z.object({
      courseCode: courseCodeSchema,
      courseName: personNameSchema,
      semester: semesterSchema,
      academicYear: academicYearSchema,
    }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid course details" }, { status: 422 });
    }

    const { courseCode: code, courseName: name, semester, academicYear } = parsed.data;

    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user's class context
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("class_id")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile?.class_id) {
      logger.error("API Course Add: Failed to fetch user class", profileError);
      return NextResponse.json({ error: "No class associated with your profile" }, { status: 400 });
    }

    // Insert into class_courses
    const { error: insertError } = await supabase
      .from("class_courses")
      .insert({
        class_id: profile.class_id,
        course_code: code,
        course_name: name,
        semester,
        academic_year: academicYear,
        created_by: user.id
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "This course is already in your class lineup." }, { status: 409 });
      }
      logger.error("API Course Add: Database insert failed", insertError);
      return NextResponse.json({ error: "Failed to add course to lineup" }, { status: 500 });
    }

    return NextResponse.json({ message: "Course added successfully" }, { status: 201 });
  } catch (error) {
    logger.error("API Course Add: Unexpected error", error);
    return NextResponse.json({ error: "An internal error occurred" }, { status: 500 });
  }
}

export const POST = withSecurity(handler);
