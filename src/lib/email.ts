// src/lib/email.ts
import * as Sentry from "@sentry/nextjs";
import sanitizeHtml from "sanitize-html";
import { redact } from "./utils";
import { logger } from "./logger";

/**
 * Email sending configuration parameters.
 */
export interface SendEmailProps {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML email body */
  html: string;
  /** Plain text fallback (optional) */
  text?: string;
}

/**
 * Result of an email provider send attempt.
 * Used for failover logic and error tracking.
 */
interface ProviderResult {
  /** Whether the email was successfully sent */
  success: boolean;
  /** Email provider that handled the request */
  provider: "Brevo" | "SendPulse";
  /** Message ID from provider (if successful) */
  id?: string;
  /** Error message or object (if failed) */
  error?: string | Error;
}

const hasBrevo = !!process.env.BREVO_API_KEY;
const hasSendPulse = !!(
  process.env.SENDPULSE_CLIENT_ID && 
  process.env.SENDPULSE_CLIENT_SECRET
);

/**
 * Gets the sender email address from environment configuration.
 * Formats with 'admin' prefix for system emails.
 * 
 * @returns Formatted sender email address
 * @throws {Error} If NEXT_PUBLIC_APP_EMAIL is not configured
 */
const getSenderEmail = () => {
  const appEmail = process.env.NEXT_PUBLIC_APP_EMAIL;
  if (!appEmail) {
    const err = new Error('NEXT_PUBLIC_APP_EMAIL is not configured');
    Sentry.captureException(err, { tags: { type: "config_error", location: "getSenderEmail" } });
    throw err;
  }
  return 'admin@' + appEmail.replace(/^@/, '');
};

// Configuration
const CONFIG = {
  // Lazy getter: evaluated only when sending email, not at module load time.
  // This prevents a crash on cold start if NEXT_PUBLIC_APP_EMAIL is not yet set.
  get sender() {
    return {
      name: process.env.NEXT_PUBLIC_APP_NAME || 'GhostClass',
      email: getSenderEmail(),
    };
  },
  brevo: {
    url: "https://api.brevo.com/v3/smtp/email",
    get key() { return process.env.BREVO_API_KEY; },
  },
  sendpulse: {
    authUrl: "https://api.sendpulse.com/oauth/access_token",
    emailUrl: "https://api.sendpulse.com/smtp/emails",
    get clientId() { return process.env.SENDPULSE_CLIENT_ID; },
    get clientSecret() { return process.env.SENDPULSE_CLIENT_SECRET; },
  },
};

/**
 * Obtains OAuth access token from SendPulse API.
 * Required for authenticating email send requests.
 * 
 * @returns Access token string
 * @throws {Error} If SendPulse credentials not configured or auth fails
 */
async function getSendPulseToken() {
  if (!hasSendPulse) throw new Error("SendPulse credentials not configured");
  
  try {
    const res = await fetch(CONFIG.sendpulse.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: CONFIG.sendpulse.clientId,
        client_secret: CONFIG.sendpulse.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`SendPulse auth HTTP ${res.status}`);
    const data = await res.json();
    return data.access_token;
  } catch (error) {
    logger.error("Failed to get SendPulse token", error);
    throw new Error("SendPulse Auth Failed");
  }
}

/**
 * Sends email via SendPulse provider.
 * Handles authentication and API communication.
 * 
 * @param params - Email parameters (to, subject, html, text)
 * @returns Provider result with success status and details
 * @throws {Error} If SendPulse not configured
 */
async function sendViaSendPulse({ to, subject, html, text }: SendEmailProps): Promise<ProviderResult> {
  if (!hasSendPulse) throw new Error("SendPulse not configured");

  try {
    const token = await getSendPulseToken();

    const payload = {
      email: {
        html: Buffer.from(html).toString("base64"), 
        text: text || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }),
        subject,
        from: CONFIG.sender,
        to: [{ email: to, name: "User" }],
      },
    };

    const res = await fetch(CONFIG.sendpulse.emailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(err.message || `SendPulse API error: ${res.status}`);
    }
    const data = await res.json() as { id?: string };

    return { success: true, provider: "SendPulse", id: data.id };
  } catch (error: unknown) {
    const err = error as { message?: string };
    throw new Error(err.message || 'Unknown error');
  }
}

/**
 * Brevo Adapter
 */
async function sendViaBrevo({ to, subject, html, text }: SendEmailProps): Promise<ProviderResult> {
  if (!hasBrevo) throw new Error("Brevo not configured");

  try {
    const payload = {
      sender: CONFIG.sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }),
    };

    const res = await fetch(CONFIG.brevo.url, {
      method: 'POST',
      headers: {
        "api-key": CONFIG.brevo.key!,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(err.message || `Brevo API error: ${res.status}`);
    }
    const data = await res.json() as { messageId?: string };

    return { success: true, provider: "Brevo", id: data.messageId };
  } catch (error: unknown) {
    const err = error as { message?: string };
    throw new Error(err.message || 'Unknown error');
  }
}

/**
 * Main Controller (Load Balancer & Failover)
 */
export async function sendEmail(props: SendEmailProps): Promise<ProviderResult> {
  let primary: typeof sendViaSendPulse | typeof sendViaBrevo;
  let secondary: typeof sendViaSendPulse | typeof sendViaBrevo | null = null;
  let primaryName: string;
  let secondaryName: string | null = null;

  // If both available, randomize load
  if (hasBrevo && hasSendPulse) {
    const startWithSendPulse = Math.random() < 0.5;
    primary = startWithSendPulse ? sendViaSendPulse : sendViaBrevo;
    secondary = startWithSendPulse ? sendViaBrevo : sendViaSendPulse;
    primaryName = startWithSendPulse ? "SendPulse" : "Brevo";
    secondaryName = startWithSendPulse ? "Brevo" : "SendPulse";
  } 
  // If only one available
  else if (hasSendPulse) {
    primary = sendViaSendPulse;
    primaryName = "SendPulse";
  } else if (hasBrevo) {
    primary = sendViaBrevo;
    primaryName = "Brevo";
  } else {
    const error = new Error("No email provider configured");
    Sentry.captureException(error, { tags: { type: "config_critical", location: "sendEmail" } });
    throw error;
  }

  try {
    // Attempt Primary
    return await primary(props);
  } catch (primaryError: unknown) {
    const primaryErr = primaryError as Error;
    logger.warn(`Primary provider (${primaryName}) failed:`, primaryErr.message);

    // Report non-fatal primary failure to Sentry
    Sentry.captureMessage(`Email Failover Triggered: ${primaryName} failed`, {
        level: "warning",
        tags: { 
            failed_provider: primaryName,
            recipient_domain: props.to.split('@')[1],
            location: "sendEmail"
        },
        extra: { error: primaryErr.message }
    });

    // Try secondary if available
    if (secondary) {
      logger.dev(`Switching to secondary provider (${secondaryName})...`);
      try {
        return await secondary(props);
      } catch (secondaryError: unknown) {
        const outerErr = primaryError as Error;
        const secondaryErr = secondaryError as Error;
        const errorMsg = `All email providers failed. Primary: ${outerErr.message} | Secondary: ${secondaryErr.message}`;
        logger.error(errorMsg);
        
        // Report CRITICAL total failure
        Sentry.captureException(new Error(errorMsg), {
            tags: { type: "email_delivery_critical", location: "sendEmail" },
            extra: { to: redact("email", props.to), subject: props.subject }
        });

        return {
          success: false,
          provider: secondaryName! as "Brevo" | "SendPulse",
          error: errorMsg,
        };
      }
    } else {
      Sentry.captureException(primaryError, {
         tags: { type: "email_delivery_fail_no_backup", location: "sendEmail" },
         extra: { provider: primaryName }
      });
      
      return {
        success: false,
        provider: primaryName as "Brevo" | "SendPulse",
        error: primaryErr.message,
      };
    }
  }
}