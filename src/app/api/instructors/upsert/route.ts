import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { courseCodeSchema, personNameSchema } from "@/lib/validation/text";
import { normalizeCourseCode } from "@/lib/utils";

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (!token) return null;
    const supabaseAdmin = getAdminClient();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      logger.error(
        "API Instructor Upsert: Bearer auth.getUser error:",
        error || "No user",
      );
      return null;
    }
    return { user, supabase: supabaseAdmin };
  }

  const supabaseClient = await createClient();
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    logger.error(
      "API Instructor Upsert: Client auth.getUser error:",
      error || "No user",
    );
    return null;
  }
  return { user, supabase: supabaseClient };
}

async function handler(
  req: NextRequest,
  { decryptedBody }: { decryptedBody?: unknown },
) {
  try {
    const body = decryptedBody || await req.json();
    const rawBody = typeof body === "object" && body !== null
      ? body as Record<string, unknown>
      : {};
    const courseCodeValue = rawBody.courseCode;
    const instructorNameValue = rawBody.instructorName;

    if (
      typeof courseCodeValue !== "string" || courseCodeValue.trim() === "" ||
      typeof instructorNameValue !== "string" ||
      instructorNameValue.trim() === ""
    ) {
      return NextResponse.json({ error: "Missing required fields" }, {
        status: 400,
      });
    }

    const parsed = z.object({
      courseCode: courseCodeSchema,
      instructorName: personNameSchema,
    }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues[0]?.message ?? "Invalid instructor details",
      }, { status: 422 });
    }

    const { courseCode, instructorName } = parsed.data;

    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user's class context
    const { data: profile, error: profileError } =
      await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              single: () => Promise<
                { data: { class_id: string } | null; error: unknown }
              >;
            };
          };
        };
      })
        .from("users")
        .select("class_id")
        .eq("auth_id", user.id)
        .single();

    if (profileError || !profile?.class_id) {
      logger.error(
        "API Instructor Upsert: Failed to fetch user class",
        profileError,
      );
      return NextResponse.json({
        error: "No class associated with your profile",
      }, { status: 400 });
    }

    const normalizedCode = normalizeCourseCode(courseCode);
    const optionalCourseName = typeof rawBody.courseName === "string"
      ? rawBody.courseName.trim()
      : "";

    // Ensure class_courses record exists (satisfying foreign key course_instructors_class_course_fkey)
    const { error: courseError } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (
          d: Record<string, unknown>,
          opt?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => Promise<{ error: { code: string; message: string } | null }>;
      };
    })
      .from("class_courses")
      .upsert({
        class_id: profile.class_id,
        course_code: normalizedCode,
        course_name: optionalCourseName || normalizedCode,
        created_by: user.id,
      }, {
        onConflict: "class_id, course_code",
        ignoreDuplicates: true,
      });

    if (courseError) {
      logger.error(
        "API Instructor Upsert: Database upsert failed for class_courses pre-requisite",
        courseError,
      );
    }

    // Upsert into course_instructors (communal mapping shared by the class)
    const { error: upsertError } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (
          d: Record<string, unknown>,
          opt?: { onConflict?: string },
        ) => Promise<{ error: { code: string; message: string } | null }>;
      };
    })
      .from("course_instructors")
      .upsert({
        class_id: profile.class_id,
        course_code: normalizedCode,
        instructor_name: instructorName,
        updated_by: user.id,
      }, {
        onConflict: "class_id, course_code",
      });

    if (upsertError) {
      logger.error(
        "API Instructor Upsert: Database upsert failed",
        upsertError,
      );
      return NextResponse.json({
        error: "Failed to save instructor to database",
      }, { status: 500 });
    }

    return NextResponse.json({ message: "Instructor saved successfully" }, {
      status: 200,
    });
  } catch (error) {
    logger.error("API Instructor Upsert: Unexpected error", error);
    return NextResponse.json({ error: "An internal error occurred" }, {
      status: 500,
    });
  }
}

export const POST = withSecurity(handler);
