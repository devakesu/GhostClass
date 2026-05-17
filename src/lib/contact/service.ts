import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { 
  renderContactAdminEmail, 
  renderContactConfirmationEmail 
} from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import sanitizeHtml from "sanitize-html";
import { redact } from "@/lib/utils.server";

// VALIDATION SCHEMA
export const contactSchema = z.object({
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
  
  token: z.string().optional(),
  csrf_token: z.string().optional(),
});

interface ContactContext {
  userId?: string | null;
  ip?: string;
  userAgent?: string;
}

interface ContactInsertResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

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

const getContactEmail = () => {
  const appEmail = process.env.NEXT_PUBLIC_APP_EMAIL;
  if (!appEmail) {
    throw new Error('NEXT_PUBLIC_APP_EMAIL is not configured');
  }
  return 'contact@' + appEmail.replace(/^@/, '');
};

// ---------------------------------------------------------------------------
// CORE SERVICE
// ---------------------------------------------------------------------------

/**
 * Handles the full lifecycle of a contact form submission:
 * 1. Sanitization
 * 2. Database Insertion
 * 3. Dual Email Notification (Admin + Confirmation)
 * 4. Transactional Rollback (Delete from DB if emails fail)
 */
export async function processContactSubmission(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any, // Required for rollback if RLS is strict
  payload: z.infer<typeof contactSchema>,
  ctx: ContactContext = {},
): Promise<ContactInsertResult> {
  let insertedId: string | null = null;

  try {
    // 1. Save to Database
    const { data, error: dbError } = await supabaseAdmin
      .from("contact_messages")
      .insert({
        user_id: ctx.userId ?? null,
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        subject: payload.subject?.trim() || "New Contact Form Submission",
        message: payload.message.trim(),
        status: "new",
      })
      .select("id")
      .single();

    if (dbError) throw new Error(dbError.message || "Failed to save contact message");
    insertedId = data.id as string;

    // 2. Prepare Email Content
    const safeName = escapeHtml(payload.name);
    const safeSubject = escapeHtml(payload.subject || "General Inquiry");
    const safeMessage = sanitizeForEmail(payload.message);
    const safeEmail = escapeHtml(payload.email);
    const userType = ctx.userId ? "Registered User" : "Guest Visitor";

    // 3. Send Notification to ADMIN
    const adminEmailResult = await sendEmail({
      to: getContactEmail(),
      subject: `[New Inquiry] ${safeSubject}`,
      replyTo: payload.email,
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

    // 4. Send Confirmation to USER (Non-fatal)
    try {
      await sendEmail({
        to: payload.email,
        subject: `We received your message: ${safeSubject}`,
        html: renderContactConfirmationEmail({
          name: safeName,
          subject: safeSubject,
          message: safeMessage,
        }),
      });
    } catch (confirmationError) {
      logger.warn("[ContactService] Failed to send user confirmation email:", confirmationError);
      Sentry.captureException(confirmationError, {
        level: "warning",
        tags: { type: "email_confirmation_failed", location: "ContactService" },
        extra: { email: redact("email", payload.email), insertedId }
      });
    }

    return { success: true, id: insertedId };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[ContactService] Contact flow failed:", errorMsg);

    Sentry.captureException(error, {
        tags: { type: "contact_flow_failure", location: "ContactService" },
        extra: { 
            email: redact("email", payload.email),
            has_inserted_db: !!insertedId,
            user_ip: ctx.ip ? redact("id", ctx.ip) : "unknown",
        }
    });

    // ROLLBACK: Delete from DB if emails failed
    if (insertedId) {
      logger.warn(`[ContactService] Rolling back: Deleting message ${insertedId}...`);
      
      const { error: deleteError } = await supabaseAdmin
        .from("contact_messages")
        .delete()
        .eq("id", insertedId);

      if (deleteError) {
        logger.error("[ContactService] CRITICAL: Rollback failed!", deleteError);
        Sentry.captureException(deleteError, {
             tags: { type: "rollback_failed", location: "ContactService" },
             extra: { insertedId }
        });
      }
    }

    return { 
      success: false, 
      error: errorMsg || "Failed to process message. Please try again later." 
    };
  }
}
