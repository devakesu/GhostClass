import { readFileSync } from "fs";
import { join } from "path";

/**
 * Raw YAML template cached at module scope.
 * The file never changes at runtime; reading it once eliminates
 * per-request filesystem I/O in the force-dynamic /api/openapi route.
 */
const RAW_YAML = readFileSync(
  join(process.cwd(), "public", "openapi", "openapi.yaml"),
  "utf-8"
);

/**
 * Substitutes ${NEXT_PUBLIC_*} tokens in the OpenAPI YAML template with
 * their current environment variable values.
 *
 * Called per-request so changes to env vars (e.g. between deploy and
 * container restart) are reflected without a build.
 */
export function resolveOpenApiSpec(): string {
  const substitutions: Record<string, string> = {
    "${NEXT_PUBLIC_APP_URL}": process.env.NEXT_PUBLIC_APP_URL ?? "",
    "${NEXT_PUBLIC_APP_EMAIL}": process.env.NEXT_PUBLIC_APP_EMAIL ?? "",
    "${NEXT_PUBLIC_GITHUB_URL}": process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
  };
  return Object.entries(substitutions).reduce(
    (s, [token, value]) => s.replaceAll(token, value),
    RAW_YAML
  );
}
