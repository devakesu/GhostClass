/**
 * Development-only Swagger / API reference UI at /api/docs
 *
 * Serves the interactive Scalar API reference in development.
 * Returns 404 in every other environment so the viewer is never
 * accidentally reachable on staging or production.
 *
 * The viewer is purposely kept at /api/docs (short, memorable) and
 * is separate from the static Scalar page at /api-docs which ships
 * in the production bundle.
 */

import { ApiReference } from "@scalar/nextjs-api-reference";
import { NextResponse } from "next/server";
import { resolveOpenApiSpec } from "@/lib/openapi";

export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV === "development";

export function GET() {
  if (!isDev) {
    return new NextResponse(null, { status: 404 });
  }

  const handler = ApiReference({
    content: resolveOpenApiSpec(),
    theme: "purple",
    layout: "modern",
    darkMode: true,
    showSidebar: true,
    defaultOpenAllTags: true,
    authentication: {
      preferredSecurityScheme: "SupabaseAuth",
    },
  });

  return typeof handler === "function" ? handler() : handler;
}
