import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { fetchEzygoData } from "@/lib/ezygo-batch-fetcher";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils.server";
import { proxyRateLimiter } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/attendance/summary-batch
 *
 * Fetches attendance summaries for multiple courses in parallel.
 * This replaces N individual requests from the client with a single batch request,
 * which the backend then handles efficiently using the EzyGo batch fetcher
 * (which provides request deduplication and global rate limiting).
 */
const handler = async (req: NextRequest, { decryptedBody }: { decryptedBody?: any }) => {
  // 1. Rate limiting — keyed per IP to prevent abuse
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json({ error: "Unable to determine client IP" }, { status: 400 });
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

  // 4. Parse request body (handle both JWE and plain JSON)
  let body = decryptedBody;
  if (!body) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  }

  const { courses } = body;
  if (!Array.isArray(courses)) {
    return NextResponse.json({ error: "Courses must be an array" }, { status: 400 });
  }

  // 5. Batch fetch summaries from EzyGo
  // We use Promise.all to fetch in parallel, but the ezygo-batch-fetcher
  // will ensure we don't exceed the global concurrency limit (max 3).
  const results: Record<string, any> = {};
  const promises = courses.map(async (course: { code: string; id: number; name: string }) => {
    try {
      // Custom/Staging courses with ID 0 don't exist in EzyGo
      if (!course.id || course.id === 0) {
        results[course.code] = {
          present: 0,
          absent: 0,
          total: 0,
          percentage: 0,
          course: { id: 0, name: course.name, code: course.code }
        };
        return;
      }

      // Fetch with fallback for EzyGo typos (summery vs summary)
      let data;
      try {
        data = await fetchEzygoData(`/attendancereports/institutionuser/courses/${course.id}/summery`, token);
      } catch (_err) {
        // Only fallback if the first one failed (e.g. 404)
        // fetchEzygoData returns NonBreakerError for 404s
        data = await fetchEzygoData(`/attendancereports/institutionuser/courses/${course.id}/summary`, token);
      }
      
      if (data) {
        results[course.code] = data;
      }
    } catch (_err) {
      logger.warn(`[attendance-batch] Failed to fetch summary for ${course.code} (ID: ${course.id}):`, _err);
      // We continue to allow other courses to succeed even if one fails
    }
  });

  await Promise.all(promises);

  // Return the map of results
  return NextResponse.json(results);
};

// Wrap with security HOF to handle App Check and JWE decryption for mobile clients
export const POST = withSecurity(handler as any);
