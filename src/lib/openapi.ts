import { readFileSync } from "fs";
import { join } from "path";

const YAML_PATH = join(process.cwd(), "public", "openapi", "openapi.yaml");
const RAW_YAML_CACHE = process.env.NODE_ENV === "production"
  ? readFileSync(YAML_PATH, "utf-8")
  : null;

/**
 * Substitutes ${NEXT_PUBLIC_*} tokens in the OpenAPI YAML template with
 * their current environment variable values.
 */
export function resolveOpenApiSpec(): string {
  const isProd = process.env.NODE_ENV === "production";
  const yaml = (isProd && RAW_YAML_CACHE)
    ? RAW_YAML_CACHE
    : readFileSync(YAML_PATH, "utf-8");

  const substitutions: Record<string, string> = {
    "${NEXT_PUBLIC_APP_URL}": process.env.NEXT_PUBLIC_APP_URL ?? "",
    "${NEXT_PUBLIC_APP_EMAIL}": process.env.NEXT_PUBLIC_APP_EMAIL ?? "",
    "${NEXT_PUBLIC_GITHUB_URL}": process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
  };

  return Object.entries(substitutions).reduce(
    (s, [token, value]) => s.replaceAll(token, value),
    yaml,
  );
}
