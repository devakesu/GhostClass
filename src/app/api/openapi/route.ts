import { resolveOpenApiSpec } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * Serves the OpenAPI YAML spec with environment variable placeholders replaced
 * at request time. The static file at public/openapi/openapi.yaml is never
 * processed by Next.js, so ${NEXT_PUBLIC_*} tokens would be served literally.
 * This route reads the file once at module scope (cached) and substitutes
 * env tokens per-request via the shared resolveOpenApiSpec() helper.
 */
export function GET() {
  const yaml = resolveOpenApiSpec();

  return new Response(yaml, {
    headers: {
      // application/yaml is the registered IANA media type for YAML documents.
      // Browsers and OpenAPI tooling use this to identify the spec correctly.
      "Content-Type": "application/yaml; charset=utf-8",
      // Spec content changes only when the file or env changes — short cache is fine.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
