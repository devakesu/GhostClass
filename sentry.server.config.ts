// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Remove the api_secret query parameter from GA4 Measurement Protocol URLs.
 * ga4-collect.ts is the single place that appends this secret to outgoing URLs;
 * this scrubber provides defense-in-depth for any traces that are still captured
 * before the request leaves the process.
 */
function scrubGaApiSecret(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const allowedHosts = new Set([
      "www.google-analytics.com",
      "google-analytics.com",
    ]);
    if (!allowedHosts.has(hostname)) {
      return url;
    }
    if (parsed.searchParams.has("api_secret")) {
      parsed.searchParams.set("api_secret", "[Filtered]");
      return parsed.toString();
    }
  } catch {
    // Unparseable URL — return as-is rather than throwing
  }
  return url;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Set sample rate (usually lower in production, e.g., 0.1)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Only enable debug logs in development
  debug: process.env.NODE_ENV === "development",

  // Security: Handle PII carefully
  sendDefaultPii: false,

  beforeSend(event, hint) {
    // Filter out common network errors that don't indicate real issues
    const error = hint?.originalException;
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message).toLowerCase();
      
      // Ignore aborted requests (common during hot reload, navigation, etc.)
      if (errorMessage.includes('aborted') || 
          errorMessage.includes('econnreset') ||
          errorMessage.includes('epipe') ||
          errorMessage.includes('client closed') ||
          errorMessage.includes('socket hang up')) {
        return null; // Don't send to Sentry
      }
    }
    
    // Scrub Authorization headers from all captured requests
    if (event.request && event.request.headers) {
      const headers = { ...event.request.headers };
      delete headers["authorization"];
      delete headers["cookie"];
      event.request.headers = headers;
    }
    return event;
  },

  // Scrub api_secret from GA4 URLs in breadcrumbs (defense-in-depth, C-2)
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
      breadcrumb.data = { ...breadcrumb.data, url: scrubGaApiSecret(breadcrumb.data.url) };
    }
    return breadcrumb;
  },

  // Scrub api_secret from GA4 URLs in performance/transaction spans (defense-in-depth, C-2)
  beforeSendTransaction(event) {
    if (Array.isArray(event.spans)) {
      for (const span of event.spans) {
        if (span.data?.["http.url"] && typeof span.data["http.url"] === "string") {
          span.data["http.url"] = scrubGaApiSecret(span.data["http.url"]);
        }
        if (span.data?.["url"] && typeof span.data["url"] === "string") {
          span.data["url"] = scrubGaApiSecret(span.data["url"]);
        }
      }
    }
    return event;
  },
});
