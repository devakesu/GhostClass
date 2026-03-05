import { ApiReference } from "@scalar/nextjs-api-reference";
import { readFileSync } from "fs";
import { join } from "path";

function resolvedSpec(): string {
  const yaml = readFileSync(join(process.cwd(), "public", "openapi", "openapi.yaml"), "utf-8");
  const substitutions: Record<string, string> = {
    "${NEXT_PUBLIC_APP_URL}": process.env.NEXT_PUBLIC_APP_URL ?? "",
    "${NEXT_PUBLIC_APP_EMAIL}": process.env.NEXT_PUBLIC_APP_EMAIL ?? "",
    "${NEXT_PUBLIC_GITHUB_URL}": process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
  };
  return Object.entries(substitutions).reduce(
    (s, [token, value]) => s.replaceAll(token, value),
    yaml
  );
}

export const GET = ApiReference({
  content: resolvedSpec(),
  theme: "purple",
  layout: "modern",
  darkMode: true,
  showSidebar: true,
  defaultOpenAllTags: true,
  authentication: {
    preferredSecurityScheme: "SupabaseAuth",
  },
});
