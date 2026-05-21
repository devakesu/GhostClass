import { NextResponse, NextRequest } from "next/server";
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
      logger.error("API Instructor Upsert: Bearer auth.getUser error:", error || "No user");
      return null;
    }
    return { user, supabase: supabaseAdmin };
  }

  const supabaseClient = await createClient();
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    logger.error("API Instructor Upsert: Client auth.getUser error:", error || "No user");
    return null;
  }
  return { user, supabase: supabaseClient };
}

async function handler(req: NextRequest, { decryptedBody }: { decryptedBody?: unknown }) {
  try {
    const body = decryptedBody || await req.json();
    const rawBody = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    const courseCodeValue = rawBody.courseCode;
    const instructorNameValue = rawBody.instructorName;
    const semesterValue = rawBody.semester;
    const academicYearValue = rawBody.academicYear;

    if (
      typeof courseCodeValue !== "string" || courseCodeValue.trim() === "" ||
      typeof instructorNameValue !== "string" || instructorNameValue.trim() === "" ||
      typeof semesterValue !== "string" || semesterValue.trim() === "" ||
      typeof academicYearValue !== "string" || academicYearValue.trim() === ""
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsed = z.object({
      courseCode: courseCodeSchema,
      instructorName: personNameSchema,
      semester: semesterSchema,
      academicYear: academicYearSchema,
    }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid instructor details" }, { status: 422 });
    }

    const { courseCode, instructorName, semester, academicYear } = parsed.data;

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
      logger.error("API Instructor Upsert: Failed to fetch user class", profileError);
      return NextResponse.json({ error: "No class associated with your profile" }, { status: 400 });
    }

    // Upsert into course_instructors (communal mapping shared by the class)
    const { error: upsertError } = await supabase
      .from("course_instructors")
      .upsert({
        class_id: profile.class_id,
        course_code: courseCode,
        instructor_name: instructorName,
        semester,
        academic_year: academicYear,
        updated_by: user.id
      }, {
        onConflict: "class_id, course_code, semester, academic_year"
      });

    if (upsertError) {
      logger.error("API Instructor Upsert: Database upsert failed", upsertError);
      return NextResponse.json({ error: "Failed to save instructor to database" }, { status: 500 });
    }

    return NextResponse.json({ message: "Instructor saved successfully" }, { status: 200 });
  } catch (error) {
    logger.error("API Instructor Upsert: Unexpected error", error);
    return NextResponse.json({ error: "An internal error occurred" }, { status: 500 });
  }
}

export const POST = withSecurity(handler);
