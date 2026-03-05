import { ApiReference } from "@scalar/nextjs-api-reference";
import { resolveOpenApiSpec } from "@/lib/openapi";

export const GET = ApiReference({
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
