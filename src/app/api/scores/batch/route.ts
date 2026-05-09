import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { createClient } from "@/lib/supabase/server";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { fetchEzygoData } from "@/lib/ezygo-batch-fetcher";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils.server";
import { proxyRateLimiter } from "@/lib/ratelimit";
import { ExamQuestion, ExamAnswer } from "@/types";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * POST /api/scores/batch
 *
 * Fetches exam questions and answers for multiple exams in parallel.
 * This replaces 2*N individual requests from the client with a single batch request.
 */
interface BatchRequest {
  examIds: number[];
}

const BatchRequestSchema = z.object({
  examIds: z.array(z.number()).max(25, "Maximum 25 exams per batch")
});

interface ExamDetails {
  questions: ExamQuestion[];
  answers: ExamAnswer[];
}

const handler = async (req: NextRequest, { decryptedBody }: { decryptedBody?: BatchRequest }) => {
  // 1. Rate limiting
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json({ error: "Unable to determine client IP" }, { status: 400 });
  }
  const { success } = await proxyRateLimiter.limit(`scores_batch_${ip}`);
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

  // 4. Parse request body
  let body = decryptedBody;
  if (!body) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  }

  const validation = BatchRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid request format", details: validation.error.format() }, { status: 400 });
  }

  const { examIds } = validation.data;

  const limitedIds = examIds;
  const results: Record<number, ExamDetails> = {};

  const promises = limitedIds.map(async (id: number) => {
    try {
      // Fetch both questions and answers for this exam
      // The ezygo-batch-fetcher handles concurrency limits (max 3)
      const [questions, answers] = await Promise.all([
        fetchEzygoData<ExamQuestion[]>(`/exams/${id}/examquestions?from_view_score=true`, token),
        fetchEzygoData<ExamAnswer[]>(`/exams/${id}/institutionuser/examanswers`, token)
      ]);
      
      results[id] = {
        questions: questions || [],
        answers: answers || []
      };
    } catch (_err) {
      logger.warn(`[scores-batch] Failed to fetch details for exam ${id}:`, _err);
      results[id] = {
        questions: [],
        answers: [],
        error: _err instanceof Error ? _err.message : "Failed to fetch from EzyGo"
      } as any;
    }
  });

  await Promise.all(promises);

  return NextResponse.json(results);
};

export const POST = withSecurity<BatchRequest>(handler);
