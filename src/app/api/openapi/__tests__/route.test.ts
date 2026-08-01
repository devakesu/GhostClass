import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import { resolveOpenApiSpec } from "@/lib/openapi";

vi.mock("@/lib/openapi", () => ({
  resolveOpenApiSpec: vi.fn(),
}));

describe("GET /api/openapi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the resolved OpenAPI spec with correct headers", async () => {
    const mockYaml = "openapi: 3.0.0";
    vi.mocked(resolveOpenApiSpec).mockReturnValue(mockYaml);

    const response = await GET();

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe(mockYaml);
    expect(response.headers.get("Content-Type")).toContain("application/yaml");
    expect(response.headers.get("Cache-Control")).toContain("public");
  });
});
