"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { headers } from "next/headers";
import { contactRateLimiter } from "@/lib/ratelimit";
import {
  renderContactAdminEmail,
  renderContactConfirmationEmail,
} from "@/lib/email-templates";
import { redact, getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";

// VALIDATION SCHEMA
const contactSchema = z.object({
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name too long")
    .regex(/^[a-zA-Z\s'-]+$/, "Name contains invalid characters"),
  
  email: z
    .email("Invalid email format")
    .max(255, "Email too long")
    .transform(val => val.toLowerCase().trim()),
  
  subject: z.string()
    .max(200, "Subject too long")
    .transform(val => val.trim())
    .optional(),
  
  message: z.string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message too long")
    .transform(val => val.trim()),
  
  token: z.string()
    .min(20, "Invalid CAPTCHA token"),
  
  // .optional() removed — the CSRF token is mandatory. Marking it optional would
  // mislead future readers into thinking omission is acceptable, and would silently pass
  // Zod validation if the CSRF-check order were ever reversed (Zod-first, then
  // validateCsrfToken), allowing token-free payloads through schema validation.
  csrf_token: z.string()
    .min(1, "Missing CSRF token"),
});

// Sanitize HTML to prevent injection attacks while preserving safe formatting
const sanitizeForEmail = (text: string): string => {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const withBreaks = normalizedText.replace(/\n/g, "<br>");
  
  return sanitizeHtml(withBreaks, {
    allowedTags: ["br", "strong", "em", "b", "i"],
    allowedAttributes: {},
    disallowedTagsMode: "escape",
  });
};

const escapeHtml = (text: string) => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};



/**
 * Gets the contact email address from environment variable.
 * Formats it with 'contact' prefix for contact form submissions.
 * 
 * @returns Contact email address
 * @throws {Error} If NEXT_PUBLIC_APP_EMAIL is not configured
 * 
 * @example
 * ```ts
 * const email = getContactEmail(); // Returns 'contact@example.com'
 * ```
 */
const getContactEmail = () => {
  const appEmail = process.env.NEXT_PUBLIC_APP_EMAIL;
  if (!appEmail) {
    throw new Error('NEXT_PUBLIC_APP_EMAIL is not configured');
  }
  return 'contact@' + appEmail.replace(/^@/, '');
};

/**
 * Server action for processing contact form submissions with comprehensive security.
 * Implements honeypot, rate limiting, CSRF protection, CAPTCHA verification, and origin validation.
 * 
 * @param formData - Form data containing contact information and security tokens
 * @returns Success/error response with status message
 * 
 * Security Features:
 * - Honeypot field for bot detection
 * - IP-based rate limiting
 * - CSRF token validation
 * - Origin header validation
 * - Cloudflare Turnstile CAPTCHA
 * - Input sanitization and validation (Zod schema)
 * 
 * Process:
 * 1. Honeypot check
 * 2. CSRF validation
 * 3. Origin validation
 * 4. IP extraction and rate limiting
 * 5. Input validation (name, email, message)
 * 6. CAPTCHA verification
 * 7. Check for spam patterns
 * 8. Upsert user in database
 * 9. Send email notifications
 * 
 * @example
 * ```ts
 * const result = await submitContactForm(formData);
 * if (result.error) {
 *   console.error(result.error);
 * }
 * ```
 */
export async function submitContactForm(formData: FormData) {

  // 1. Honeypot check (anti-bot)
  const honeypot = formData.get("website"); 
  if (honeypot) {
    logger.warn("Honeypot triggered");
    return { error: "Invalid submission" };
  }

  const headerList = await headers();

  // 2. CSRF validation
  // Validate CSRF token from FormData against cookie
  const csrfToken = formData.get("csrf_token") as string | null;
  const csrfValid = await validateCsrfToken(csrfToken);
  if (!csrfValid) {
    logger.warn("Invalid CSRF token in contact form submission");
    return { error: "Invalid security token. Please refresh and try again." };
  }

  // Server Actions have built-in CSRF protection through Next.js origin validation.
  // The framework automatically validates that requests come from the same origin.
  // We enforce additional origin validation below for defense-in-depth.
  
  // 3. Origin validation — enforce for all requests (skip in development)
  if (process.env.NODE_ENV !== "development") {
    const origin = headerList.get("origin");
    const host = headerList.get("host");
    if (!origin || !host) {
      return { error: "Invalid origin" };
    }

    try {
      // Use .hostname (not .host) to exclude port and properly handle IPv6 addresses
      const originHostname = new URL(origin).hostname.toLowerCase();
      const headerHostname = new URL(`http://${host}`).hostname.toLowerCase();
      
      if (originHostname !== headerHostname) {
        return { error: "Invalid origin" };
      }
    } catch {
      return { error: "Invalid origin" };
    }
  }

  // 4. IP extraction and rate limiting
  const ip = getClientIp(headerList);
  if (!ip) {
    const relevantHeaders: Record<string, string | null> = {
      "cf-connecting-ip": headerList.get("cf-connecting-ip"),
      "x-real-ip": headerList.get("x-real-ip"),
      "x-forwarded-for": headerList.get("x-forwarded-for"),
    };
    const safeHeaders = Object.fromEntries(
      Object.entries(relevantHeaders).map(([k, v]) => [k, v ? redact("id", v) : null])
    );
    logger.error("Unable to determine client IP from headers in contact form", { headers: safeHeaders });
    Sentry.captureMessage("Unable to determine client IP from headers in contact form", {
      level: "warning",
      extra: { headers: safeHeaders },
    });
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

  // 5. Validate Input
  const result = contactSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }
  
  const { name, email, subject, message, token } = result.data;

  // 6. Verify CAPTCHA
  const verifyRes = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      headers: { "Content-Type": "application/json" },
    }
  );
  const verifyData = await verifyRes.json();
  if (!verifyData.success) {
    return { error: "CAPTCHA validation failed. Are you a robot?" };
  }

  // 7. Get User Context (Read-Only check)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // The contact_messages table has an open INSERT RLS policy ("Anyone can insert contact messages"
  // WITH CHECK (true)), so no elevated privileges are needed for the insert. The admin client is
  // only needed for the rollback DELETE, which has no per-user RLS policy.
  const supabaseAdmin = getAdminClient();

  let insertedId: string | null = null;

  try {
    // 8. Save to Database (Using regular client — INSERT RLS policy is open to all)
    const { data: insertedMessage, error: dbError } = await supabase
      .from("contact_messages")
      .insert({
        user_id: user?.id || null,
        name,
        email,
        subject: subject || "New Contact Form Submission",
        message,
        status: 'new'
      })
      .select("id")
      .single();

    if (dbError) throw new Error(dbError.message);
    
    insertedId = insertedMessage.id;

    // Sanitize inputs for Email
    const safeName = escapeHtml(name);
    const safeSubject = escapeHtml(subject || "General Inquiry");
    const safeMessage = sanitizeForEmail(message);
    const safeEmail = escapeHtml(email);
    const userType = user ? "Registered User" : "Guest Visitor";

    // 9. Send Notification to ADMIN
    const adminEmailResult = await sendEmail({
      to: getContactEmail(),
      subject: `[New Inquiry] ${safeSubject}`,
      html: renderContactAdminEmail({
        name: safeName,
        email: safeEmail,
        subject: safeSubject,
        message: safeMessage,
        userType,
        messageId: String(insertedId),
      }),
    });

    if (!adminEmailResult || !adminEmailResult.success) {
      throw new Error(`Admin email failed: ${adminEmailResult?.error || "Unknown error"}`);
    }

    // 9b. Send Confirmation to USER
    try {
      await sendEmail({
        to: email,
        subject: `We received your message: ${safeSubject}`,
        html: renderContactConfirmationEmail({
          name: safeName,
          subject: safeSubject,
          message: safeMessage,
        }),
      });
    } catch (confirmationError) {
      logger.warn("Failed to send user confirmation email:", confirmationError);
      // Non-fatal error: Capture as warning
      Sentry.captureException(confirmationError, {
        level: "warning",
        tags: { type: "email_confirmation_failed", location: "contact_form" },
        extra: { email: redact("email", email), insertedId: insertedId }
      });
    }

    return { success: true };

  } catch (error: any) {
    logger.error("Contact flow failed:", error);

    // Capture the main failure
    Sentry.captureException(error, {
        tags: { type: "contact_form_failure", location: "contact_form" },
        extra: { 
            email: redact("email", email),
            has_inserted_db: !!insertedId,
            // A truncated /24 prefix (e.g. "203.0.113.0") still PII-identifies a
            // home broadband subnet. Use the same redact() hash used everywhere else;
            // it is sufficient for Sentry correlation without exposing the raw IP.
            user_ip: redact("id", ip),
        }
    });

    // ROLLBACK (Using Admin Client)
    if (insertedId) {
      logger.warn(`Rolling back: Deleting message ${insertedId}...`);
      
      const { error: deleteError } = await supabaseAdmin
        .from("contact_messages")
        .delete()
        .eq("id", insertedId);

      if (deleteError) {
        logger.error("CRITICAL: Rollback failed!", deleteError);
        // Critical failure: Data inconsistency
        Sentry.captureException(deleteError, {
             tags: { type: "rollback_failed", location: "contact_form" },
             extra: { insertedId }
        });
      } else {
        logger.dev("Rollback successful.");
      }
    }

    return { error: "Failed to send message. Please try again." };
  }
}