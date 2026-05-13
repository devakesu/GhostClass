import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { toTitleCase } from "@/lib/utils";

/**
 * API Route for adding a new course to a class lineup.
 * Primarily used by the mobile app which bypasses the Turnstile check 
 * but uses JWE/AppCheck/PlayIntegrity for security.
 */
async function handler(req: Request, { decryptedBody }: { decryptedBody?: unknown }) {
  try {
    const body = decryptedBody || await req.json();
    
    const code = String(body.courseCode ?? "").trim().toUpperCase().replace(/[\s\u00A0-]/g, "");
    const name = toTitleCase(String(body.courseName ?? ""));
    const semester = String(body.semester ?? "").trim();
    const academicYear = String(body.academicYear ?? "").trim();

    if (!code || !name || !semester || !academicYear) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();
    
    // Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
