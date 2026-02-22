// API Route for CSP violation reports
// POST /api/csp-report
//
// Browsers send violation reports here when a Content-Security-Policy directive is
// violated. Two formats are accepted:
//   - application/csp-report      (legacy report-uri mechanism)
//   - application/reports+json    (modern Reporting API v1, report-to mechanism)
//
// The endpoint logs a sanitized subset of each report for visibility and always
// returns 204 No Content so the browser does not retry. No authentication is required:
// reports are sent automatically by the browser before any user session exists.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ACCEPTED_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
];

// Hard limit on accepted body size (bytes) to protect against oversized requests
// on this unauthenticated endpoint.
const MAX_BODY_BYTES = 8192;

/**
 * Strips the query string and fragment from a URL string so that sensitive
 * parameters (e.g. auth tokens, OAuth codes) are not written to logs.
 * Returns the original string unchanged if it is not a parseable URL.
 */
function sanitizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const url = new URL(raw);
    return url.origin + url.pathname;
  } catch {
    // Not a valid absolute URL — return as-is (no query strings to strip).
    return raw;
  }
}

/**
 * Extracts a safe, structured log payload from a raw CSP report body.
 * Only a fixed set of non-sensitive fields is included.
 */
function extractLogFields(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return {};

    // Legacy report-uri format: { "csp-report": { ... } }
    const report =
      (parsed as Record<string, unknown>)["csp-report"] ??
      // Reporting API v1 wraps reports in an array: [{ body: { ... } }]
      (Array.isArray(parsed)
        ? (parsed[0] as Record<string, unknown>)?.["body"]
        : undefined) ??
      parsed;

    if (typeof report !== "object" || report === null) return {};

    const r = report as Record<string, unknown>;
    return {
      "document-uri": sanitizeUrl(r["document-uri"] ?? r["documentURL"]),
      "blocked-uri": sanitizeUrl(r["blocked-uri"] ?? r["blockedURL"]),
      "violated-directive": r["violated-directive"] ?? r["effectiveDirective"],
      "original-policy": typeof r["original-policy"] === "string"
        ? r["original-policy"].slice(0, 512)
        : undefined,
      disposition: r["disposition"],
      "status-code": r["status-code"],
    };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const isAccepted = ACCEPTED_CONTENT_TYPES.some((t) => contentType.includes(t));

  if (!isAccepted) {
    return new NextResponse(null, { status: 415 });
  }

  // Reject oversized bodies before reading them to prevent memory/CPU abuse on
  // this unauthenticated endpoint.
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    // Explicitly handle invalid or negative Content-Length values.
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      return new NextResponse(null, { status: 400 });
    }
    if (parsedLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
  }

  try {
    const bodyBuffer = await req.arrayBuffer();
    if (bodyBuffer.byteLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const text = new TextDecoder("utf-8").decode(bodyBuffer);
    const fields = extractLogFields(text);
    logger.warn("[CSP] Violation report received", fields);
  } catch {
    // Ignore malformed report bodies silently.
  }

  return new NextResponse(null, { status: 204 });
}
