// src/lib/email.ts
import * as Sentry from "@sentry/nextjs";
import sanitizeHtml from "sanitize-html";
import { redact } from "./utils";
import { logger } from "./logger";

export interface SendEmailProps {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
  toName?: string;
}

interface ProviderResult {
  success: boolean;
  provider: "Brevo" | "SendPulse";
  id?: string;
  error?: string | Error;
}

const hasBrevo = !!process.env.BREVO_API_KEY;
const hasSendPulse = !!(
  process.env.SENDPULSE_CLIENT_ID && 
  process.env.SENDPULSE_CLIENT_SECRET
);

const getSenderEmail = () => {
  const appEmail = process.env.NEXT_PUBLIC_APP_EMAIL;
  if (!appEmail) {
    const err = new Error('NEXT_PUBLIC_APP_EMAIL is not configured');
    Sentry.captureException(err, { tags: { type: "config_error", location: "getSenderEmail" } });
    throw err;
  }
  return 'admin@' + appEmail.replace(/^@/, '');
};

const getSenderName = (fromName?: string) => fromName?.trim() || process.env.NEXT_PUBLIC_APP_NAME || 'GhostClass';

const CONFIG = {
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
    if (error instanceof Error) {
      const wrapped = new Error(`SendPulse Auth Failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }
    throw new Error(`SendPulse Auth Failed: ${String(error)}`);
  }
}

async function sendViaSendPulse({ to, subject, html, text, replyTo, fromName, toName }: SendEmailProps): Promise<ProviderResult> {
  if (!hasSendPulse) throw new Error("SendPulse not configured");

  try {
    const token = await getSendPulseToken();
    const payload = {
      email: {
        html: Buffer.from(html).toString("base64"), 
        text: text || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }),
        subject,
        from: {
          email: CONFIG.sender.email,
          name: getSenderName(fromName),
        },
        to: [{ email: to, name: toName || "User" }],
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
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
      throw new Error(err.message || `SendPulse error: ${res.status}`);
    }
    const data = await res.json() as { id?: string };
    return { success: true, provider: "SendPulse", id: data.id };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

async function sendViaBrevo({ to, subject, html, text, replyTo, fromName, toName }: SendEmailProps): Promise<ProviderResult> {
  if (!hasBrevo) throw new Error("Brevo not configured");

  try {
    const payload = {
      sender: {
        email: CONFIG.sender.email,
        name: getSenderName(fromName),
      },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject,
      htmlContent: html,
      textContent: text || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }),
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
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
      throw new Error(err.message || `Brevo error: ${res.status}`);
    }
    const data = await res.json() as { messageId?: string };
    return { success: true, provider: "Brevo", id: data.messageId };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

function shouldUseSendPulse(): boolean {
  if (hasBrevo && hasSendPulse) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    return array[0] < 128;
  }
  return hasSendPulse;
}

type ProviderFn = (p: SendEmailProps) => Promise<ProviderResult>;

async function executeFailover(
  secondary: ProviderFn,
  props: SendEmailProps,
  sName: "Brevo" | "SendPulse",
  err: unknown
): Promise<ProviderResult> {
  const errMsg = err instanceof Error ? err.message : String(err);
  try {
    return await secondary(props);
  } catch (err2: unknown) {
    const err2Msg = err2 instanceof Error ? err2.message : String(err2);
    const msg = `All providers failed. P: ${errMsg} | S: ${err2Msg}`;
    logger.error(msg);
    Sentry.captureException(err2 instanceof Error ? err2 : new Error(msg), {
      tags: { type: "email_critical" },
      extra: {
        to: redact("email", props.to),
        primary_error: errMsg,
        secondary_error: err2Msg,
      }
    });
    return { success: false, provider: sName, error: msg };
  }
}

export async function sendEmail(props: SendEmailProps): Promise<ProviderResult> {
  const useSP = shouldUseSendPulse();
  const primary: ProviderFn = useSP ? sendViaSendPulse : sendViaBrevo;
  let secondary: ProviderFn | null = null;
  if (hasBrevo && hasSendPulse) {
    secondary = useSP ? sendViaBrevo : sendViaSendPulse;
  }
  const pName: "SendPulse" | "Brevo" = useSP ? "SendPulse" : "Brevo";
  const sName: "Brevo" | "SendPulse" = useSP ? "Brevo" : "SendPulse";

  if (!hasBrevo && !hasSendPulse) {
    const err = new Error("No provider");
    Sentry.captureException(err, { tags: { location: "sendEmail" } });
    throw err;
  }

  try {
    return await primary(props);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`${pName} failed:`, err instanceof Error ? err : errMsg);
    Sentry.captureMessage(`Failover: ${pName} failed`, {
      level: "warning",
      tags: { provider: pName, location: "sendEmail" },
    });

    if (secondary) {
      return await executeFailover(secondary, props, sName, err);
    }
    return { success: false, provider: pName, error: errMsg };
  }
}
