import { NextResponse, NextRequest } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { toTitleCase } from "@/lib/utils";

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

    const courseCode = String(body.courseCode ?? "").trim().toUpperCase().replace(/[\s\u00A0-]/g, "");
    const instructorName = toTitleCase(String(body.instructorName ?? ""));
    const semester = String(body.semester ?? "").trim();
    const academicYear = String(body.academicYear ?? "").trim();

    if (!courseCode || !instructorName || !semester || !academicYear) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (semester !== "odd" && semester !== "even") {
      return NextResponse.json({ error: "Semester must be 'odd' or 'even'" }, { status: 400 });
    }

    if (!/^\d{4}-(\d{4}|\d{2})$/.test(academicYear)) {
      return NextResponse.json({ error: "Invalid academic year format (expected YYYY-YYYY or YYYY-YY)" }, { status: 400 });
    }

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
