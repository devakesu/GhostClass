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
  return (
    typeof val === "object" &&
    val !== null &&
    "value" in val &&
    typeof (val as { value: unknown }).value === "string"
  );
}

function sanitizeGA4Name(name: string) {
  // GA4 event names and property keys must start with a letter,
  // contain only alphanumeric characters and underscores,
  // and be between 1-40 characters.
  return name
    .replace(/\W/g, "_")
    .replace(/^[^a-zA-Z]/, "a_") // Must start with a letter
    .slice(0, 40);
}

function getSanitizedUserProperties(userProperties: unknown) {
  if (!userProperties || typeof userProperties !== "object") return undefined;

  const sanitized: Record<string, { value: string }> = {};
  const up = userProperties as Record<string, unknown>;

  Object.entries(up).forEach(([key, value]) => {
    const safeKey = sanitizeGA4Name(key);
    // Only assign if the sanitized key matches GA4 allowed pattern
    if (/^[a-zA-Z]\w{0,39}$/.test(safeKey)) {
      if (typeof value === "string") {
        Reflect.set(sanitized, safeKey, { value });
      } else if (isGA4UserProperty(value)) {
        Reflect.set(sanitized, safeKey, value);
      }
    }
  });

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

const handler = async (
  req: Request,
  { decryptedBody }: { decryptedBody?: unknown },
) => {
  try {
    const ip = getClientIp(req.headers);
    if (!ip) return NextResponse.json({ error: "No IP" }, { status: 400 });

    const { success, reset } = await syncRateLimiter.limit(ip);
    if (!success) {
      const waitTime = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": waitTime.toString() },
        },
      );
    }

    let body = decryptedBody;
    if (!body) {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { clientId, events, userProperties } = body as Record<
      string,
      unknown
    >;
    if (!clientId || !Array.isArray(events)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const sanitizedEvents: GA4Event[] = events.map(
      (event: Record<string, unknown>) => ({
        name: sanitizeGA4Name(String(event.name || "event")),
        params: (event.params as Record<string, string | number | boolean>) ||
          {},
      }),
    );

    const sanitizedUP = getSanitizedUserProperties(userProperties);

    await trackGA4Event(
      clientId as string,
      sanitizedEvents,
      sanitizedUP,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Analytics API] Error:", error);
    Sentry.captureException(error, {
      tags: { type: "analytics_api_error", location: "api/analytics/track" },
    });
    return NextResponse.json(
      { error: "Failed to process tracking data." },
      { status: 500 },
    );
  }
};

export const POST = withSecurity(handler as unknown as typeof handler);
