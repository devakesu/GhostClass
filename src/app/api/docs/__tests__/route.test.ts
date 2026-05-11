/**
 * Tests for /api/docs route (dev-only Scalar API reference viewer)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ApiReference must be mocked before importing the route module.
// The real library returns `() => Response`; our route calls it when it's a function.
vi.mock("@scalar/nextjs-api-reference", () => ({
  ApiReference: vi.fn(() => () => new Response("scalar ui", { status: 200 })),
}));

describe("GET /api/docs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 404 in non-development environments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("../route");
    const response = GET();
    expect(response.status).toBe(404);
  });

  it("returns 200 from ApiReference in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { ApiReference } = await import("@scalar/nextjs-api-reference");
    vi.mocked(ApiReference).mockReturnValue(() => new Response("scalar ui", { status: 200 }));
    const { GET } = await import("../route");
    const response = GET();
    expect(response.status).toBe(200);
  });

  it("calls ApiReference with the expected configuration in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { ApiReference } = await import("@scalar/nextjs-api-reference");
    const { GET } = await import("../route");
    GET();
    expect(ApiReference).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.any(String),
        theme: "purple",
        darkMode: true,
      })
    );
  });

  it("does not call ApiReference in non-development environments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { ApiReference } = await import("@scalar/nextjs-api-reference");
    vi.mocked(ApiReference).mockClear();
    const { GET } = await import("../route");
    GET();
    expect(ApiReference).not.toHaveBeenCalled();
  });
});
