import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks (must be hoisted before imports) ---

const mockGetUser = vi.fn();
const mockSingle = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    })),
  })),
}));

vi.mock("@/lib/csp", () => ({
  getCspHeader: vi.fn(() => "default-src 'self'"),
}));

vi.mock("@/app/config/legal", () => ({
  TERMS_VERSION: "2.3",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

import { proxy } from "../proxy";

describe("proxy – Scenario A: unauthenticated user on protected route", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("redirects to / and clears session cookies (but preserves csrf_token)", async () => {
    const request = new NextRequest("http://localhost/dashboard");
    const response = await proxy(request);

    // Should redirect to the login page
    expect(response.status).toBe(307);

    // Session cookies must be cleared (Max-Age=0 means deletion)
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
    expect(isDeleted("terms_redirect_count")).toBe(true);
    // csrf_token is intentionally NOT cleared on unauthenticated redirects — only on
    // explicit logout. Clearing it here would break the login flow when the 30-minute
    // per-tab throttle in useCSRFToken is still active (cookie gone, sessionStorage stale).
    expect(isDeleted("csrf_token")).toBe(false);
  });
});

describe("proxy – Scenario D: authenticated user on auth route", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
  });

  it("redirects authenticated user on / to /dashboard and clears terms_redirect_count", async () => {
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: "terms_version=2.3; terms_redirect_count=2",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");

    // Stale redirect counter must be cleared so a fresh login doesn't inherit it
    const isDeleted = (name: string) =>
      response.headers.getSetCookie().some(
        (h) =>
          h.toLowerCase().startsWith(name.toLowerCase() + "=") &&
          (h.toLowerCase().includes("max-age=0") ||
            h.toLowerCase().includes("expires=thu, 01 jan 1970")),
      );
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
        cookie: "terms_version=2.3",
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
        cookie: "terms_version=2.3",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy – cross-device terms sync", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-456" } },
      error: null,
    });
  });

  it("sets terms_version cookie and allows through when DB has current version but cookie is missing", async () => {
    mockSingle.mockResolvedValue({
      data: { terms_version: "2.3" },
      error: null,
    });

    const request = new NextRequest("http://localhost/dashboard");
    // No terms_version cookie

    const response = await proxy(request);

    // Should allow through (200), not redirect to accept-terms
    expect(response.status).toBe(200);

    // Should set the terms_version cookie
    const setCookies = response.headers.getSetCookie();
    const termsCookie = setCookies.find((h) =>
      h.toLowerCase().startsWith("terms_version="),
    );
    expect(termsCookie).toBeDefined();
    expect(termsCookie).toContain("2.3");
  });

  it("sets terms_version cookie and allows through when DB has current version but cookie is stale", async () => {
    mockSingle.mockResolvedValue({
      data: { terms_version: "2.3" },
      error: null,
    });

    const request = new NextRequest("http://localhost/dashboard", {
      headers: {
        cookie: "terms_version=1.0",
      },
    });

    const response = await proxy(request);

    // Should allow through (200), not redirect to accept-terms
    expect(response.status).toBe(200);

    // Should set the updated terms_version cookie
    const setCookies = response.headers.getSetCookie();
    const termsCookie = setCookies.find((h) =>
      h.toLowerCase().startsWith("terms_version="),
    );
    expect(termsCookie).toBeDefined();
    expect(termsCookie).toContain("2.3");
  });

  it("falls back to redirect when DB query returns an error", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "connection refused", code: "PGRST000" },
    });

    const request = new NextRequest("http://localhost/dashboard");
    // No terms_version cookie

    const response = await proxy(request);

    // Should redirect to accept-terms
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/accept-terms");
  });

  it("redirects to accept-terms when DB has outdated terms_version", async () => {
    mockSingle.mockResolvedValue({
      data: { terms_version: "2.1" },
      error: null,
    });

    const request = new NextRequest("http://localhost/dashboard");
    // No terms_version cookie; DB version is stale compared to TERMS_VERSION

    const response = await proxy(request);

    // Should redirect to accept-terms because DB terms_version is outdated
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/accept-terms");
  });
});

describe("proxy – auth.getUser throws an error", () => {
  const isDeleted = (res: Response, name: string) =>
    res.headers.getSetCookie().some(
      (h) =>
        h.toLowerCase().startsWith(name.toLowerCase() + "=") &&
        (h.toLowerCase().includes("max-age=0") ||
          h.toLowerCase().includes("expires=thu, 01 jan 1970")),
    );

  it("clears session cookies and redirects when getUser throws refresh_token_not_found", async () => {
    mockGetUser.mockRejectedValueOnce({
      code: "refresh_token_not_found",
      status: 400,
      message: "Invalid Refresh Token: old",
    });

    const request = new NextRequest("http://localhost/dashboard");
    const response = await proxy(request);

    // user is null after catch → protected route redirects to /
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/");

    // Cookies should be cleared by clearSessionCookies
    expect(isDeleted(response, "ezygo_access_token")).toBe(true);
    expect(isDeleted(response, "terms_version")).toBe(true);
  });

  it("clears session cookies and redirects when getUser throws an unrecognised error", async () => {
    mockGetUser.mockRejectedValueOnce(new Error("Network error"));

    const request = new NextRequest("http://localhost/dashboard");
    const response = await proxy(request);

    // user is null after catch → protected route redirects to /
    expect(response.status).toBe(307);
    expect(isDeleted(response, "ezygo_access_token")).toBe(true);
  });

  it("proceeds unauthenticated (200) on a public route when getUser throws a non-object", async () => {
    // Throwing a non-object (string) exercises the !error || typeof !== 'object' branch
    // inside isRefreshTokenNotFoundError, which returns false
    mockGetUser.mockRejectedValueOnce("invalid error");

    // Public auth route (/), not protected → no redirect
    const request = new NextRequest("http://localhost/");
    const response = await proxy(request);

    // No user, but / is not a protected route (user && isAuthRoute guard isn't hit)
    expect(response.status).toBe(200);
  });
});
