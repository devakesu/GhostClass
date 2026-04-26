"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { contactRateLimiter } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";
import { 
  processContactSubmission, 
  contactSchema 
} from "@/lib/contact/service";

/**
 * Server action for processing contact form submissions from the web UI.
 * Implements web-specific security layers (Honeypot, CSRF, Turnstile, Rate Limiting).
 * Delegates core processing to the shared ContactService.
 */
export async function submitContactForm(formData: FormData) {
  // 1. Honeypot check (anti-bot)
  const honeypot = formData.get("website"); 
  if (honeypot) {
    logger.warn("Honeypot triggered in contact form");
    return { error: "Invalid submission" };
  }

  const headerList = await headers();

  // 2. CSRF validation
  const csrfToken = formData.get("csrf_token") as string | null;
  const csrfValid = await validateCsrfToken(csrfToken);
  if (!csrfValid) {
    logger.warn("Invalid CSRF token in contact form submission");
    return { error: "Invalid security token. Please refresh and try again." };
  }

  // 3. Origin validation (skip in development)
  if (process.env.NODE_ENV !== "development") {
    const origin = headerList.get("origin");
    const host = headerList.get("host");
    if (!origin || !host) return { error: "Invalid origin" };

    try {
      const originHostname = new URL(origin).hostname.toLowerCase();
      const headerHostname = new URL(`http://${host}`).hostname.toLowerCase();
      if (originHostname !== headerHostname) return { error: "Invalid origin" };
    } catch {
      return { error: "Invalid origin" };
    }
  }

  // 4. IP extraction and rate limiting
  const ip = getClientIp(headerList);
  if (!ip) {
    logger.error("Unable to determine client IP in contact form");
    return { error: "Unable to determine client IP" };
  }

  const { success } = await contactRateLimiter.limit(`contact:${ip}`);
  if (!success) {
    return { error: "Too many requests. Please try again later." };
  }
  
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    token: formData.get("cf-turnstile-response"),
    csrf_token: formData.get("csrf_token"),
  };

  // 5. Input validation (Zod)
  const result = contactSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }
  
  // 6. CAPTCHA verification (Cloudflare Turnstile)
  try {
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: result.data.token,
        }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return { error: "CAPTCHA validation failed. Are you a robot?" };
    }
  } catch (err) {
    logger.error("Turnstile verification failed", err);
    return { error: "Security check failed. Please try again." };
  }

  // 7. Execute Unified Service
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const flowResult = await processContactSubmission(
    supabase,
    supabaseAdmin,
    result.data,
    {
      userId: user?.id,
      ip,
      userAgent: headerList.get("user-agent") || undefined,
    }
  );

  if (!flowResult.success) {
    return { error: flowResult.error || "Failed to send message" };
  }

  return { success: true };
}