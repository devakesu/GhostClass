import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * Serves the OpenAPI YAML spec with environment variable placeholders replaced
 * at request time. The static file at public/openapi/openapi.yaml is never
 * processed by Next.js, so ${NEXT_PUBLIC_*} tokens would be served literally.
 * This route reads the file, substitutes known tokens, and returns the result
 * with the correct content-type so Scalar (and other consumers) receive a valid spec.
 */
export async function GET() {
  const filePath = join(process.cwd(), "public", "openapi", "openapi.yaml");
  let yaml = readFileSync(filePath, "utf-8");

  const substitutions: Record<string, string> = {
    "${NEXT_PUBLIC_APP_URL}": process.env.NEXT_PUBLIC_APP_URL ?? "",
    "${NEXT_PUBLIC_APP_EMAIL}": process.env.NEXT_PUBLIC_APP_EMAIL ?? "",
    "${NEXT_PUBLIC_GITHUB_URL}": process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
  };

  for (const [token, value] of Object.entries(substitutions)) {
    yaml = yaml.replaceAll(token, value);
  }

  return new Response(yaml, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Spec content changes only when the file or env changes — short cache is fine.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
