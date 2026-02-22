/**
 * Tests for CSRF API Route
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "../route";

// Mock the CSRF module
vi.mock("@/lib/security/csrf", () => ({
  initializeCsrfToken: vi.fn(),
  regenerateCsrfToken: vi.fn(),
}));

// Mock rate limiter
vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: {
    limit: vi.fn(),
  },
}));

// Mock utils.server – return a valid IP by default; override per-test when needed.
vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: (key: string) => (key === "x-forwarded-for" ? "127.0.0.1" : null),
  })),
}));

describe("CSRF API Route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset getClientIp to return a valid IP by default
    const { getClientIp } = await import("@/lib/utils.server");
    vi.mocked(getClientIp).mockReturnValue("127.0.0.1");
    // Allow all requests by default; individual tests may override
    const { authRateLimiter } = await import("@/lib/ratelimit");
    vi.mocked(authRateLimiter.limit).mockResolvedValue({
      success: true, limit: 10, reset: 60, remaining: 9,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/csrf", () => {
    it("should return CSRF token successfully", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      const mockToken = "test-csrf-token-123";
      vi.mocked(initializeCsrfToken).mockResolvedValue(mockToken);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        token: mockToken,
        message: "CSRF token initialized successfully",
      });
      expect(initializeCsrfToken).toHaveBeenCalledOnce();
    });

    it("should have no-cache headers", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      vi.mocked(initializeCsrfToken).mockResolvedValue("token");

      const response = await GET();
      
      expect(response.headers.get("Cache-Control")).toBe(
        "no-store, max-age=0"
      );
    });

    it("should enforce rate limiting", async () => {
      const { authRateLimiter } = await import("@/lib/ratelimit");
      const { initializeCsrfToken } = await import("@/lib/security/csrf");

      vi.mocked(authRateLimiter.limit).mockResolvedValue({
        success: false, limit: 10, reset: 60, remaining: 0,
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain("Too many CSRF initialization requests");
      expect(data.retryAfter).toBe(60);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("60");
      expect(initializeCsrfToken).not.toHaveBeenCalled();
    });

    it("should use csrf_init_ rate limit key", async () => {
      const { authRateLimiter } = await import("@/lib/ratelimit");
      const { getClientIp } = await import("@/lib/utils.server");
      const { initializeCsrfToken } = await import("@/lib/security/csrf");

      vi.mocked(getClientIp).mockReturnValue("192.168.1.100");
      vi.mocked(initializeCsrfToken).mockResolvedValue("token");

      await GET();

      expect(authRateLimiter.limit).toHaveBeenCalledWith("csrf_init_192.168.1.100");
    });

    it("should continue when IP cannot be determined", async () => {
      const { getClientIp } = await import("@/lib/utils.server");
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");

      vi.mocked(getClientIp).mockReturnValue(null);
      vi.mocked(initializeCsrfToken).mockResolvedValue("token-no-ip");

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("token-no-ip");
      // Rate limiter must not be called when IP is unknown
      expect(authRateLimiter.limit).not.toHaveBeenCalled();
    });

    it("should handle initialization errors", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      const error = new Error("Token initialization failed");
      vi.mocked(initializeCsrfToken).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: "Failed to initialize CSRF token",
      });
    });

    it("should handle unexpected errors gracefully", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      vi.mocked(initializeCsrfToken).mockRejectedValue("Unexpected error");

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await GET();
      
      expect(response.status).toBe(500);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("POST /api/csrf", () => {
    it("should refresh CSRF token successfully", async () => {
      const { regenerateCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");
      
      const mockToken = "refreshed-token-456";
      vi.mocked(regenerateCsrfToken).mockResolvedValue(mockToken);
      vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        token: mockToken,
        message: "CSRF token refreshed successfully",
      });
      expect(regenerateCsrfToken).toHaveBeenCalledOnce();
    });

    it("should have no-cache headers", async () => {
      const { regenerateCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");
      
      vi.mocked(regenerateCsrfToken).mockResolvedValue("token");
      vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

      const response = await POST();
      
      expect(response.headers.get("Cache-Control")).toBe(
        "no-store, max-age=0"
      );
    });

    it("should enforce rate limiting", async () => {
      const { regenerateCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");
      
      vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: false } as any);

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain("Too many token regeneration requests");
      // Verify token regeneration is not called when rate limited
      expect(regenerateCsrfToken).not.toHaveBeenCalled();
    });

    it("should handle refresh errors", async () => {
      const { regenerateCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");
      
      const error = new Error("Token refresh failed");
      vi.mocked(regenerateCsrfToken).mockRejectedValue(error);
      vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: "Failed to refresh CSRF token",
      });
    });

    it("should always generate new tokens on POST", async () => {
      const { regenerateCsrfToken } = await import("@/lib/security/csrf");
      const { authRateLimiter } = await import("@/lib/ratelimit");
      
      vi.mocked(regenerateCsrfToken)
        .mockResolvedValueOnce("token-1")
        .mockResolvedValueOnce("token-2");
      vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

      const response1 = await POST();
      const data1 = await response1.json();
      
      const response2 = await POST();
      const data2 = await response2.json();

      expect(data1.token).toBe("token-1");
      expect(data2.token).toBe("token-2");
      expect(regenerateCsrfToken).toHaveBeenCalledTimes(2);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle rapid successive requests", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      vi.mocked(initializeCsrfToken).mockResolvedValue("token");

      const promises = [GET(), GET(), GET()];
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(3);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it("should work correctly when token already exists", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      const existingToken = "existing-token";
      vi.mocked(initializeCsrfToken).mockResolvedValue(existingToken);

      const response = await GET();
      const data = await response.json();

      expect(data.token).toBe(existingToken);
    });
  });

  describe("Security properties", () => {
    it("should not expose sensitive error details", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      const sensitiveError = new Error("Database password: secret123");
      vi.mocked(initializeCsrfToken).mockRejectedValue(sensitiveError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      // Error message should be generic
      expect(data.error).toBe("Failed to initialize CSRF token");
      // Should not contain sensitive information
      expect(JSON.stringify(data)).not.toContain("secret123");

      consoleErrorSpy.mockRestore();
    });

    it("should return proper HTTP status codes", async () => {
      const { initializeCsrfToken } = await import("@/lib/security/csrf");
      
      // Success case
      vi.mocked(initializeCsrfToken).mockResolvedValue("token");
      let response = await GET();
      expect(response.status).toBe(200);

      // Error case
      vi.mocked(initializeCsrfToken).mockRejectedValue(new Error("error"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      response = await GET();
      expect(response.status).toBe(500);
      consoleErrorSpy.mockRestore();
    });
  });
});
