// Server-side Google Analytics 4 Measurement Protocol
// Replaces client-side gtag.js to avoid CSP issues with inline scripts
//
// GA_API_SECRET is intentionally NOT imported here. All outgoing Measurement
// Protocol requests are routed through ga4Collect() (src/lib/ga4-collect.ts),
// which is the single place that reads the secret and appends it to the URL.
// This prevents the secret from appearing in Sentry HTTP spans or other
// URL-logging middleware.

import { logger } from "@/lib/logger";
import { ga4Collect } from "@/lib/ga4-collect";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;

interface GA4Event {
  name: string;
  /**
   * Event parameters. Restricted to primitive JSON-safe types — GA4 Measurement
   * Protocol does not accept objects or arrays, and using `any` here could
   * accidentally leak PII (emails, user IDs) into analytics.
   * Never include personally-identifiable information in event params.
   */
  params?: Record<string, string | number | boolean>;
}

interface GA4PageView {
  page_location: string;
  page_title?: string;
  page_referrer?: string;
}

/**
 * Send event to GA4 via Measurement Protocol
 * Server-side only - bypasses CSP restrictions
 * 
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function trackGA4Event(
  clientId: string,
  events: GA4Event[],
  userProperties?: Record<string, { value: string }>
) {
  if (!GA_MEASUREMENT_ID) {
    logger.warn("[GA4] Measurement ID not configured");
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    logger.info("[GA4] Skipping event in development:", events);
    return;
  }

  try {
    const payload = {
      client_id: clientId,
      events: events,
      user_properties: userProperties,
    };

    // ga4Collect() (src/lib/ga4-collect.ts) is the single place that reads
    // GA_API_SECRET and appends it to the Google URL, keeping the secret out
    // of any URL that could be captured by Sentry spans or other logging.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      await ga4Collect(GA_MEASUREMENT_ID, payload, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("[GA4] Error sending event:", error);
  }
}

/**
 * Track page view via Measurement Protocol
 */
export async function trackPageView(
  clientId: string,
  pageData: GA4PageView,
  userId?: string
) {
  await trackGA4Event(
    clientId,
    [
      {
        name: "page_view",
        params: {
          page_location: pageData.page_location,
          ...(pageData.page_title && { page_title: pageData.page_title }),
          ...(pageData.page_referrer && { page_referrer: pageData.page_referrer }),
        },
      },
    ],
    userId ? { user_id: { value: userId } } : undefined
  );
}

/**
 * Generate or retrieve client ID (stored in cookie)
 * Client-side helper
 */
export function getOrCreateClientId(): string {
  if (typeof document === "undefined") return "";

  const cookieName = "_ga_client_id";
  // Use split-based lookup instead of RegExp to avoid regex injection risk
  const prefix = `${cookieName}=`;
  const pair = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  const existingId = pair ? pair.slice(prefix.length) : null;

  if (existingId) {
    return existingId;
  }

  // Generate new client ID: timestamp.random
  // crypto.getRandomValues() provides better uniqueness guarantees than
  // Math.random(), reducing the risk of client ID collisions in analytics.
  const randomPart = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const clientId = `${Date.now()}.${randomPart}`;
  
  // SameSite=Lax is intentional: the analytics client ID cookie must be sent on top-level
  // navigations from external sites (e.g. clicking a link to this app) so that returning
  // visitors are recognised across sessions. SameSite=Strict would drop the cookie on those
  // navigations, breaking session continuity. Secure ensures the cookie is only sent over
  // HTTPS in production, preventing transmission over plain HTTP connections.
  // Note: HttpOnly is intentionally omitted because this analytics client ID
  // must be readable from client-side code (via document.cookie). This means
  // the cookie is accessible to JavaScript and could be exposed via XSS, but
  // it does not contain authentication or other sensitive data.
  const isProd = process.env.NODE_ENV === "production";
  const secureAttr = isProd ? "; Secure" : "";
  document.cookie = `${cookieName}=${clientId}; path=/; max-age=63072000; SameSite=Lax${secureAttr}`; // 2 years
  
  return clientId;
}
