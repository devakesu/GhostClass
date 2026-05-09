import { NextResponse } from "next/server";
import { trackGA4Event } from "@/lib/analytics";
import { syncRateLimiter } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { withSecurity } from "@/lib/security/app-check";
import * as Sentry from "@sentry/nextjs";

interface GA4Event {
  name: string;
  params?: Record<string, string | number | boolean>;
}

function isGA4UserProperty(val: unknown): val is { value: string } {
  return typeof val === 'object' && val !== null && 'value' in val && typeof (val as { value: unknown }).value === 'string';
}

const handler = async (req: Request, { decryptedBody }: { decryptedBody?: any }) => {
  try {
    const ip = getClientIp(req.headers);
    if (!ip) return NextResponse.json({ error: "No IP" }, { status: 400 });
    
    const { success, reset } = await syncRateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, {
        status: 429,
        headers: { 'Retry-After': Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString() },
      });
    }

    let body = decryptedBody;
    if (!body) {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }
    }

    if (!body || typeof body !== 'object') return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const { clientId, events, userProperties } = body as any;
    if (!clientId || !Array.isArray(events)) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const sanitizeGA4Name = (name: string) => {
      // GA4 event names and property keys must start with a letter, 
      // contain only alphanumeric characters and underscores, 
      // and be between 1-40 characters.
      return name
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^[^a-zA-Z]/, "a_") // Must start with a letter
        .slice(0, 40);
    };

    const sanitizedEvents: GA4Event[] = events.map((event: any) => ({
      name: sanitizeGA4Name(String(event.name || "event")),
      params: event.params || {},
    }));

    let sanitizedUserProperties: any;
    if (userProperties) {
      sanitizedUserProperties = {};
      for (const [key, value] of Object.entries(userProperties)) {
        const safeKey = sanitizeGA4Name(key);
        if (typeof value === "string") {
          sanitizedUserProperties[safeKey] = { value };
        } else if (isGA4UserProperty(value)) {
          sanitizedUserProperties[safeKey] = value;
        }
      }
    }

    await trackGA4Event(clientId, sanitizedEvents, sanitizedUserProperties);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Analytics API] Error:", error);
    Sentry.captureException(error, { tags: { type: "analytics_api_error", location: "api/analytics/track" } });
    return NextResponse.json({ error: "Failed to process tracking data." }, { status: 500 });
  }
};

export const POST = withSecurity(handler as any);
