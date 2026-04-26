import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import { withSecurity, isMobileRequest } from "@/lib/security/app-check";
import {
  processContactSubmission,
  contactSchema,
} from "@/lib/contact/service";
import { getClientIp } from "@/lib/utils.server";
import { contactRateLimiter } from "@/lib/ratelimit";
import { validateCsrfToken } from "@/lib/security/csrf";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * Unified API for contact form submissions.
 * Optimized for Mobile App usage (Flutter) with Zero-Trust security (JWE + App Check).
 * Now triggers the same email notification and confirmation flow as the web app.
 *
 * Security layers:
 * - Rate limiting (per-IP via contactRateLimiter)
 * - CSRF validation for non-mobile (web) callers
 * - App Check + JWE for mobile callers (via withSecurity)
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

  // 2. CSRF validation for web callers
  // Mobile clients use App Check + JWE (handled by withSecurity) instead of CSRF.
  const mobile = isMobileRequest(headerList);
  if (!mobile) {
    const csrfToken = headerList.get(CSRF_HEADER);
    if (!(await validateCsrfToken(csrfToken))) {
      logger.warn("[contact] CSRF validation failed");
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403 },
      );
    }
  }

  // 3. Resolve Payload (JWE or JSON)
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

  // 4. Validate Input
  const result = contactSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0].message },
      { status: 400 },
    );
  }

  // 5. Resolve Auth Context
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

  // 6. Delegate to Shared Service (Full lifecycle: DB + Emails + Rollback)
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
    Sentry.captureException(new Error(flowResult.error || "Contact flow failed"), {
      tags: { type: "contact_flow_error", location: "api/contact" },
      extra: { userId, ip },
    });
    return NextResponse.json(
      { error: flowResult.error || "Failed to process message" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id: flowResult.id });
});
