import { contactSchema, processContactSubmission } from "@/lib/contact/service";
import { logger } from "@/lib/logger";
import { contactRateLimiter } from "@/lib/ratelimit";
import { withSecurity } from "@/lib/security/app-check";
import { getAdminClient } from "@/lib/supabase/admin";
import { getClientIp, redact } from "@/lib/utils.server";
import * as Sentry from "@sentry/nextjs";
import { headers as nextHeaders } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Unified API for contact form submissions.
 * Optimized for Mobile App usage (Flutter) with Zero-Trust security (App Check).
 *
 * NOTE ON DUAL RATE LIMITING:
 * This route deliberately employs a multi-layered rate limiting strategy:
 * 1. Outer Limiter (withSecurity): Broad API abuse prevention protecting endpoint infrastructure.
 * 2. Inner Limiter (contactRateLimiter): Strict resource throttle (per-IP) to prevent spamming contact submissions.
 *
 * Flow:
 * - App Check for mobile callers (via withSecurity)
 * - Rate limited via withSecurity
 * - Turnstile CAPTCHA optional check for web callers
 * - Server-side validation using Zod
 * - Rate limiting (per-IP via contactRateLimiter)
 * - CSRF validation for non-mobile (web) callers
 */
export const POST = withSecurity(async (req, { decryptedBody }) => {
  const request = req as NextRequest;
  const headerList = await nextHeaders();

  // 1. Rate limiting — keyed per IP to prevent abuse and spam
  const ip = getClientIp(headerList);
  if (!ip) {
    logger.warn("[contact] Unable to determine client IP for rate limiting");
    return NextResponse.json(
      { error: "Unable to determine client IP" },
      { status: 400 },
    );
  }

  const { success: rateLimitOk, reset } = await contactRateLimiter.limit(
    `contact_${ip}`,
  );
  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before submitting again." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.max(
            0,
            Math.ceil((reset - Date.now()) / 1000),
          ).toString(),
        },
      },
    );
  }

  // 2. Resolve Payload (JSON)
  let body = decryptedBody;
  if (!body) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
  }

  // 3. Validate Input
  const result = contactSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0].message },
      { status: 400 },
    );
  }

  // 4. Resolve Auth Context
  const supabaseAdmin = getAdminClient();
  const authHeader = headerList.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    // Use admin client to verify token — avoids double customFetch overhead in API context
    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(token);
    userId = user?.id || null;
  }

  // 5. Delegate to Shared Service (Full lifecycle: DB + Emails + Rollback)
  const flowResult = await processContactSubmission(
    supabaseAdmin,
    supabaseAdmin,
    result.data,
    {
      userId,
      ip: ip || undefined,
      userAgent: headerList.get("user-agent") || undefined,
    },
  );

  if (!flowResult.success) {
    logger.error("[contact] Submission flow failed:", flowResult.error);
    Sentry.captureException(
      new Error(flowResult.error || "Contact flow failed"),
      {
        tags: { type: "contact_flow_error", location: "api/contact" },
        extra: {
          userId: userId ? redact("id", userId) : undefined,
          ip: ip ? redact("id", ip) : undefined,
        },
      },
    );
    return NextResponse.json(
      { error: flowResult.error || "Failed to process message" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id: flowResult.id });
});
