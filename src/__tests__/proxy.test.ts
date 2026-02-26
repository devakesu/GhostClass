import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks (must be hoisted before imports) ---

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/csp", () => ({
  getCspHeader: vi.fn(() => "default-src 'self'"),
}));

vi.mock("@/app/config/legal", () => ({
  TERMS_VERSION: "2.1",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

import { proxy } from "../proxy";

describe("proxy – Scenario A: unauthenticated user on protected route", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("redirects to / and deletes all four custom session cookies", async () => {
    const request = new NextRequest("http://localhost/dashboard");
    const response = await proxy(request);

    // Should redirect to the login page
    expect(response.status).toBe(307);

    // All four custom session cookies must be cleared (Max-Age=0 means deletion)
    const setCookies = response.headers.getSetCookie();
    // NextResponse.cookies.delete() sets Expires to epoch (Jan 1 1970) to invalidate the cookie
    const isDeleted = (name: string) =>
      setCookies.some(
        (h) =>
          h.toLowerCase().startsWith(name.toLowerCase() + "=") &&
          (h.toLowerCase().includes("max-age=0") ||
            h.toLowerCase().includes("expires=thu, 01 jan 1970")),
      );

    expect(isDeleted("ezygo_access_token")).toBe(true);
    expect(isDeleted("terms_version")).toBe(true);
    expect(isDeleted("csrf_token")).toBe(true);
    expect(isDeleted("terms_redirect_count")).toBe(true);
  });
});

describe("proxy – redirect status for non-GET requests", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
  });

  it("redirects GET /accept-terms to /dashboard when terms are already accepted", async () => {
    const request = new NextRequest("http://localhost/accept-terms", {
      method: "GET",
      headers: {
        cookie: "terms_version=2.1",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
  });

  it("does not redirect POST /accept-terms when terms are already accepted", async () => {
    const request = new NextRequest("http://localhost/accept-terms", {
      method: "POST",
      headers: {
        cookie: "terms_version=2.1",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
