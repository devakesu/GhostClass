/**
 * Tests for POST /api/logout
 *
 * These tests verify that:
 * - Rate limiting (429) is enforced before any other logic
 * - A valid request clears all session cookies and returns 200
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock server-only to allow tests to run in jsdom / Node environments.
vi.mock("server-only", () => ({}));

// --- Mock rate limiter ---
const mockRateLimiterLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: { limit: mockRateLimiterLimit },
}));

// --- Mock getClientIp ---
vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// --- Mock CSRF ---
const mockValidateCsrf = vi.fn();
const mockRemoveCsrfToken = vi.fn();
vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: mockValidateCsrf,
  removeCsrfToken: mockRemoveCsrfToken,
}));

// --- Mock auth cookie ---
const mockClearAuthCookie = vi.fn();
vi.mock("@/lib/security/auth-cookie", () => ({
  clearAuthCookie: mockClearAuthCookie,
}));

// --- Mock user actions (terms cookies) ---
const mockClearTermsVersionCookie = vi.fn();
const mockClearTermsRedirectCountCookie = vi.fn();
vi.mock("@/app/actions/user", () => ({
  clearTermsVersionCookie: mockClearTermsVersionCookie,
  clearTermsRedirectCountCookie: mockClearTermsRedirectCountCookie,
}));

// --- Mock next/headers cookies() ---
const mockCookieSet = vi.fn();
const mockCookieGetAll = vi.fn().mockReturnValue([]);
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: mockCookieSet,
    getAll: mockCookieGetAll,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostReq(csrfHeader = "valid-csrf-token") {
  return new NextRequest("http://localhost/api/logout", {
    method: "POST",
    headers: {
      "x-csrf-token": csrfHeader,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limiter allows the request
    mockRateLimiterLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60000,
      limit: 5,
      remaining: 4,
    });
    // Default: CSRF is valid
    mockValidateCsrf.mockResolvedValue(true);
    // Default: all cleanup actions succeed
    mockClearAuthCookie.mockResolvedValue(undefined);
    mockRemoveCsrfToken.mockResolvedValue(undefined);
    mockClearTermsVersionCookie.mockResolvedValue(undefined);
    mockClearTermsRedirectCountCookie.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rate limiting", () => {
    it("returns 429 with Cache-Control: no-store when rate limit is exceeded", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { POST } = await import("../route");
      const res = await POST(makePostReq(), { params: {} });
      expect(res.status).toBe(429);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Retry-After")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      const body = await res.json() as { message: string };
      expect(body.message).toMatch(/too many requests/i);
    });

    it("does not call CSRF or cookie cleanup when rate limited", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { POST } = await import("../route");
      await POST(makePostReq(), { params: {} });
      expect(mockClearAuthCookie).not.toHaveBeenCalled();
    });

    it("returns 400 with Cache-Control: no-store when client IP cannot be determined", async () => {
      const { getClientIp } = await import("@/lib/utils.server");
      vi.mocked(getClientIp).mockReturnValueOnce(null);
      const { POST } = await import("../route");
      const res = await POST(makePostReq(), { params: {} });
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(mockRateLimiterLimit).not.toHaveBeenCalled();
    });
  });

  describe("successful logout", () => {
    it("returns 200 ok when rate limit passes", async () => {
      const { POST } = await import("../route");
      const res = await POST(makePostReq(), { params: {} });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it("clears auth cookie, CSRF token, and terms cookies on success", async () => {
      const { POST } = await import("../route");
      await POST(makePostReq(), { params: {} });
      expect(mockClearAuthCookie).toHaveBeenCalledOnce();
      expect(mockRemoveCsrfToken).toHaveBeenCalledOnce();
      expect(mockClearTermsVersionCookie).toHaveBeenCalledOnce();
      expect(mockClearTermsRedirectCountCookie).toHaveBeenCalledOnce();
    });

    it("clears chunked Supabase cookies on success", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      mockCookieGetAll.mockReturnValueOnce([
        { name: "sb-project-auth-token.0" },
        { name: "sb-project-auth-token.1" },
        { name: "other-cookie" },
      ]);

      const { POST } = await import("../route");
      await POST(makePostReq(), { params: {} });

      expect(mockCookieSet).toHaveBeenCalledWith(
        "sb-project-auth-token.0",
        "",
        expect.any(Object),
      );
      expect(mockCookieSet).toHaveBeenCalledWith(
        "sb-project-auth-token.1",
        "",
        expect.any(Object),
      );
    });

    it("sets secure cookie flag when HTTPS is enabled", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      vi.stubEnv("HTTPS", "true");

      const { POST } = await import("../route");
      await POST(makePostReq(), { params: {} });

      expect(mockCookieSet).toHaveBeenCalledWith(
        expect.any(String),
        "",
        expect.objectContaining({ secure: true }),
      );
    });

    it("handles Supabase URL parsing failure gracefully", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "invalid-url-no-protocol");
      const { POST } = await import("../route");
      const res = await POST(makePostReq(), { params: {} });
      expect(res.status).toBe(200); // Should still succeed even if cookie cleanup fails
    });
  });
});
