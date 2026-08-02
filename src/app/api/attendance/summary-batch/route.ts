import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { fetchEzygoData } from "@/lib/ezygo-batch-fetcher";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils.server";
import { proxyRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * POST /api/attendance/summary-batch
 *
 * Fetches attendance summaries for multiple courses in parallel.
 * This replaces N individual requests from the client with a single batch request,
 * which the backend then handles efficiently using the EzyGo batch fetcher
 * (which provides request deduplication and global rate limiting).
 */
interface BatchRequest {
  courses: {
    code: string;
    id: number;
    name: string;
  }[];
}

const BatchRequestSchema = z.object({
  courses: z.array(z.object({
    code: z.string(),
    id: z.number(),
    name: z.string(),
  })),
});

// Module-level cache for the working endpoint variant (summery vs summary)
// to avoid repeated 404s for every course in every batch request.
let workingEndpoint: "summery" | "summary" | null = null;

const handler = async (
  req: NextRequest,
  { decryptedBody }: { decryptedBody?: BatchRequest },
) => {
  // 1. Rate limiting — keyed per IP to prevent abuse
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json({ error: "Unable to determine client IP" }, {
      status: 400,
    });
  }
  const { success } = await proxyRateLimiter.limit(`attendance_batch_${ip}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 2. Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Token check
  const token = await getAuthTokenServer();
  if (!token) {
    return NextResponse.json({ error: "EzyGo token missing" }, { status: 401 });
  }

  // 4. Parse request body (plain JSON)
  let body = decryptedBody;
  if (!body) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, {
        status: 400,
      });
    }
  }

  const validation = BatchRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      error: "Invalid request format",
      details: validation.error.format(),
    }, { status: 400 });
  }

  const { courses } = validation.data;

  // 5. Batch fetch summaries from EzyGo
  // We use Promise.all to fetch in parallel, but the ezygo-batch-fetcher
  // will ensure we don't exceed the global concurrency limit (max 3).
  const AttendanceSummarySchema = z.object({
    present: z.number(),
    absent: z.number(),
    total: z.number().optional(),
    totel: z.number().optional(),
    percentage: z.number().optional(),
    persantage: z.number().optional(),
    persentage: z.number().optional(),
    course: z.object({ id: z.number(), name: z.string(), code: z.string() })
      .optional(),
    error: z.string().optional(),
  });

  type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;
  const results: Record<string, AttendanceSummary> = {};

  const promises = courses.map(
    async (course: { code: string; id: number; name: string }) => {
      try {
        // Custom/Staging courses with ID 0 don't exist in EzyGo
        if (!course.id || course.id === 0) {
          results[course.code] = {
            present: 0,
            absent: 0,
            total: 0,
            percentage: 0,
            course: { id: 0, name: course.name, code: course.code },
          };
          return;
        }

        // Fetch with fallback for EzyGo typos (summery vs summary)
        let data;
        if (workingEndpoint && process.env.VITEST !== "true") {
          data = await fetchEzygoData(
            `/attendancereports/institutionuser/courses/${course.id}/${workingEndpoint}`,
            token,
          );
        } else {
          try {
            data = await fetchEzygoData(
              `/attendancereports/institutionuser/courses/${course.id}/summery`,
              token,
            );
            workingEndpoint = "summery";
          } catch (err) {
            logger.dev(
              `[summary-batch] summery endpoint failed for ${course.id}, trying summary`,
              err,
            );
            data = await fetchEzygoData(
              `/attendancereports/institutionuser/courses/${course.id}/summary`,
              token,
            );
            workingEndpoint = "summary";
          }
        }

        if (data) {
          // Validate the response data against the schema
          const result = AttendanceSummarySchema.safeParse(data);
          if (result.success) {
            results[course.code] = result.data;
          } else {
            logger.warn(
              `[attendance-batch] Schema validation failed for ${course.code}:`,
              result.error.format(),
            );
            results[course.code] = data as AttendanceSummary; // Fallback to raw data
          }
        } else {
          throw new Error("Empty response from EzyGo");
        }
      } catch (_err) {
        logger.warn(
          `[attendance-batch] Failed to fetch summary for ${course.code} (ID: ${course.id}):`,
          _err,
        );
        results[course.code] = {
          present: 0,
          absent: 0,
          total: 0,
          percentage: 0,
          course: { id: course.id, name: course.name, code: course.code },
          error: _err instanceof Error
            ? _err.message
            : "Failed to fetch from EzyGo",
        };
      }
    },
  );

  await Promise.all(promises);

  // Return the map of results
  return NextResponse.json(results);
};

// Wrap with security HOF to handle App Check for mobile clients
export const POST = withSecurity<BatchRequest>(handler);
