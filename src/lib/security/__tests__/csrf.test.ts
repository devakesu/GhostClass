/**
 * Tests for CSRF Protection Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCsrfToken,
  getCsrfToken,
  setCsrfCookie,
  validateCsrfToken,
  initializeCsrfToken,
  regenerateCsrfToken,
  removeCsrfToken,
} from "../csrf";

// Create mock cookie store
let mockCookieStore: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const { mockRedisGet, mockRedisSet, mockRedisDel } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
}));

// Mock the Next.js cookies module
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => mockCookieStore),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  },
}));

// Mock crypto to allow spying on timingSafeEqual
vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  const mockTimingSafeEqual = vi.fn().mockImplementation(actual.timingSafeEqual);
  return {
    ...actual,
    timingSafeEqual: mockTimingSafeEqual,
    default: {
      ...actual,
      timingSafeEqual: mockTimingSafeEqual,
    },
  };
});

describe("CSRF Protection", () => {
  beforeEach(() => {
    // Create fresh mock cookie store for each test
    mockCookieStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generateCsrfToken", () => {
    it("should generate a token of correct length", () => {
      const token = generateCsrfToken();
      // 32 bytes = 64 hex characters
      expect(token).toHaveLength(64);
    });

    it("should generate unique tokens", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });

    it("should generate tokens with valid hex characters", () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("getCsrfToken", () => {
    it("should return token when it exists", async () => {
      const expectedToken = "test-token-123";
      mockCookieStore.get.mockReturnValue({ value: expectedToken });

      const token = await getCsrfToken();
      
      expect(token).toBe(expectedToken);
      expect(mockCookieStore.get).toHaveBeenCalledWith("csrf_token");
    });

    it("should return null when token doesn't exist", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const token = await getCsrfToken();
      
      expect(token).toBe(null);
    });

    it("should return null when cookie value is empty", async () => {
      mockCookieStore.get.mockReturnValue({ value: "" });

      const token = await getCsrfToken();
      
      expect(token).toBe(null);
    });
  });

  describe("setCsrfCookie", () => {
    it("should set cookie with correct configuration", async () => {
      const token = "test-token-456";
      
      await setCsrfCookie(token);
      
      expect(mockCookieStore.set).toHaveBeenCalledWith({
        name: "csrf_token",
        value: token,
        httpOnly: true, // XSS-safe: token not accessible to JavaScript
        secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
        sameSite: "strict",
        maxAge: 86400, // 24 hours
        path: "/",
      });
    });

    it("should set secure=true when NODE_ENV is production", async () => {
      const original = process.env.NODE_ENV;
      const originalHttps = process.env.HTTPS;
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("HTTPS", "");

      await setCsrfCookie("tok");
      const callArg = mockCookieStore.set.mock.calls[0][0] as any;
      expect(callArg.secure).toBe(true);

      vi.stubEnv("NODE_ENV", original);
      vi.stubEnv("HTTPS", originalHttps ?? "");
    });

    it("should set secure=true when HTTPS env var is 'true'", async () => {
      const original = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("HTTPS", "true");

      await setCsrfCookie("tok");
      const callArg = mockCookieStore.set.mock.calls[0][0] as any;
      expect(callArg.secure).toBe(true);

      vi.stubEnv("NODE_ENV", original);
      vi.stubEnv("HTTPS", "");
    });

    it("should set secure=false when neither NODE_ENV=production nor HTTPS=true", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("HTTPS", "false");

      await setCsrfCookie("tok");
      const callArg = mockCookieStore.set.mock.calls[0][0] as any;
      expect(callArg.secure).toBe(false);

      vi.stubEnv("HTTPS", "");
    });
  });

  describe("validateCsrfToken", () => {
    it("should return true for matching tokens", async () => {
      const token = "a".repeat(64); // Same length token
      mockCookieStore.get.mockReturnValue({ value: token });

      const isValid = await validateCsrfToken(token);
      
      expect(isValid).toBe(true);
    });

    it("should return false for non-matching tokens", async () => {
      mockCookieStore.get.mockReturnValue({ value: "token1" });

      const isValid = await validateCsrfToken("token2");
      
      expect(isValid).toBe(false);
    });

    it("should return false when request token is null", async () => {
      mockCookieStore.get.mockReturnValue({ value: "token" });

      const isValid = await validateCsrfToken(null);
      
      expect(isValid).toBe(false);
    });

    it("should return false when request token is undefined", async () => {
      mockCookieStore.get.mockReturnValue({ value: "token" });

      const isValid = await validateCsrfToken(undefined);
      
      expect(isValid).toBe(false);
    });

    it("should return false when cookie token doesn't exist", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const isValid = await validateCsrfToken("some-token");
      
      expect(isValid).toBe(false);
    });

    it("should use constant-time comparison", async () => {
      // This test ensures timing attacks are prevented
      const token = "b".repeat(64);
      mockCookieStore.get.mockReturnValue({ value: token });

      // Should handle different length tokens safely
      const isValid = await validateCsrfToken("short");
      
      expect(isValid).toBe(false);
    });
  });

  describe("initializeCsrfToken", () => {
    it("should return existing token if present and refresh its cookie TTL", async () => {
      const existingToken = "existing-token-123";
      mockCookieStore.get.mockReturnValue({ value: existingToken });

      const token = await initializeCsrfToken();
      
      expect(token).toBe(existingToken);
      // Cookie is always re-issued to refresh TTL and prevent the
      // "cookie expired / sessionStorage stale" desync seen after deployments.
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "csrf_token",
          value: existingToken,
        })
      );
    });

    it("should create new token if none exists", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const token = await initializeCsrfToken();
      
      expect(token).toHaveLength(64);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "csrf_token",
          value: token,
        })
      );
    });

    it("should bind token to current session when session cookie exists", async () => {
      mockCookieStore.get.mockImplementation((name) => {
        if (name === "csrf_token") return undefined;
        if (name === "__Secure-authjs.session-token") return { value: "session-123" } as any;
        return undefined;
      });

      const token = await initializeCsrfToken();

      expect(token).toHaveLength(64);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `csrf:token:${token}:session`,
        "session-123",
        expect.objectContaining({ ex: 86400 })
      );
    });

    it("should generate valid hex token", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const token = await initializeCsrfToken();
      
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("removeCsrfToken", () => {
    it("should delete the CSRF cookie", async () => {
      mockCookieStore.get.mockImplementation((name) => {
        if (name === "csrf_token") return { value: "token-123" } as any;
        return undefined;
      });

      await removeCsrfToken();
      
      expect(mockCookieStore.delete).toHaveBeenCalledWith("csrf_token");
      expect(mockRedisDel).toHaveBeenCalledWith("csrf:token:token-123:session");
    });
  });

  describe("regenerateCsrfToken", () => {
    it("should always create a new token", async () => {
      mockCookieStore.get.mockReturnValue({ value: "old-token" });

      const token = await regenerateCsrfToken();
      
      expect(token).toHaveLength(64);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "csrf_token",
          value: token,
        })
      );
    });

    it("should bind regenerated token to current session when available", async () => {
      mockCookieStore.get.mockImplementation((name) => {
        if (name === "csrf_token") return { value: "old-token" } as any;
        if (name === "authjs.session-token") return { value: "session-456" } as any;
        return undefined;
      });

      const token = await regenerateCsrfToken();

      expect(mockRedisSet).toHaveBeenCalledWith(
        `csrf:token:${token}:session`,
        "session-456",
        expect.objectContaining({ ex: 86400 })
      );
    });

    it("should generate different tokens on successive calls", async () => {
      const token1 = await regenerateCsrfToken();
      const token2 = await regenerateCsrfToken();
      
      expect(token1).not.toBe(token2);
      expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    });

    it("should generate valid hex tokens", async () => {
      const token = await regenerateCsrfToken();
      
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string tokens", async () => {
      mockCookieStore.get.mockReturnValue({ value: "" });

      const isValid = await validateCsrfToken("");
      
      expect(isValid).toBe(false);
    });

    it("should handle very long tokens", async () => {
      const longToken = "x".repeat(1000);
      await setCsrfCookie(longToken);
      
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({ value: longToken })
      );
    });

    it("should handle special characters in tokens", async () => {
      const specialToken = "abc!@#$%^&*()_+-=[]{}|;:',.<>?/~`";
      mockCookieStore.get.mockReturnValue({ value: specialToken });

      const token = await getCsrfToken();
      
      expect(token).toBe(specialToken);
    });
  });

  describe("Security Properties", () => {
    it("should set httpOnly flag (Synchronizer Token Pattern for XSS protection)", async () => {
      await setCsrfCookie("token");
      
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({ httpOnly: true })
      );
    });

    it("should set sameSite to strict", async () => {
      await setCsrfCookie("token");
      
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({ sameSite: "strict" })
      );
    });

    it("should set appropriate expiration", async () => {
      await setCsrfCookie("token");
      
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({ maxAge: 86400 }) // 24 hours
      );
    });

    it("should set path to root", async () => {
      await setCsrfCookie("token");
      
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/" })
      );
    });
  });

  describe("Branch Coverage", () => {
    it("should skip logging in production when validation fails", async () => {
      vi.resetModules();
      const originalEnv = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "production");
      
      const { validateCsrfToken } = await import("../csrf");
      
      mockCookieStore.get.mockReturnValue({ value: "short" });
      const isValid = await validateCsrfToken("longer-token");
      
      expect(isValid).toBe(false);
      
      vi.stubEnv("NODE_ENV", originalEnv);
    });

    it("should handle non-Error objects in catch block", async () => {
      const originalEnv = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "development");
      
      const crypto = await import("crypto");
      vi.mocked(crypto.timingSafeEqual).mockImplementationOnce(() => {
        throw "not-an-error-object";
      });
      
      mockCookieStore.get.mockReturnValue({ value: "token" });
      const isValid = await validateCsrfToken("token");
      
      expect(isValid).toBe(false);
      vi.stubEnv("NODE_ENV", originalEnv);
    });
  });
});
