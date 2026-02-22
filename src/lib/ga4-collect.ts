// Isolated module for GA4 Measurement Protocol requests.
//
// GA_API_SECRET is read exclusively here. No other module in the codebase should
// import or use this env var. Confining the secret to one file:
//   1. Prevents it from appearing in fetch URLs built elsewhere (and therefore in
//      Sentry HTTP spans, breadcrumbs, or any other URL-capturing middleware).
//   2. Makes auditing straightforward — there is exactly one place to review.
//
// Sentry's beforeBreadcrumb / beforeSendTransaction hooks (sentry.server.config.ts)
// additionally strip "api_secret" from any GA Measurement Protocol URLs that are
// captured in traces, as a defense-in-depth measure.

import { logger } from "@/lib/logger";

/**
 * Send a pre-built GA4 Measurement Protocol payload directly to Google.
 *
 * `GA_API_SECRET` is appended to the URL inside this function only.
 * Callers supply the measurement ID and payload — they never handle the secret.
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function ga4Collect(
  measurementId: string,
  payload: object,
  signal?: AbortSignal
): Promise<void> {
  const apiSecret = process.env.GA_API_SECRET;

  if (!apiSecret) {
    logger.warn("[GA4] GA_API_SECRET not configured; skipping send");
    return;
  }

  // Build the Google URL. api_secret is appended here — this is the only
  // location in the codebase where the secret is written into an outgoing URL.
  const gaUrl = new URL("https://www.google-analytics.com/mp/collect");
  gaUrl.searchParams.set("measurement_id", measurementId);
  gaUrl.searchParams.set("api_secret", apiSecret);

  const response = await fetch(gaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    logger.error("[GA4] Failed to send event:", response.statusText);
  }
}
