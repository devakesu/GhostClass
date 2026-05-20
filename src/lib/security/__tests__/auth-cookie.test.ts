/**
 * @vitest-environment node
 * Tests for auth-cookie.ts
 *
 * [SEC-02] ezygo_access_token must always be written with HttpOnly, Secure (in
 * production), and SameSite=Lax flags.  The save-token route is the sole
 * writer — this file asserts those security attributes so a future accidental
 * change to the cookie flags is caught by CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthCookie, clearAuthCookie, getAuthTokenServer, getAuthTokenWithFallback } from "../auth-cookie";

// Mock the Next.js cookies module (same pattern as csrf.test.ts)
let mockSet: ReturnType<typeof vi.fn>;
let mockDelete: ReturnType<typeof vi.fn>;
let mockGet: ReturnType<typeof vi.fn>;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ 
    set: mockSet,
    delete: mockDelete,
    get: mockGet
  })),
}));

// Mock Supabase
const mockSupabaseUser = { id: "user-123" };
const mockGetUser = vi.fn(async () => ({ data: { user: mockSupabaseUser } }));
const mockMaybeSingle = vi.fn(async () => ({ data: { ezygo_token: "enc-token", ezygo_iv: "iv" } }));
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: mockMaybeSingle
    }))
  }))
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser }
  }))
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(() => ({
    from: mockFrom
  }))
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "decrypted-token")
}));

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => null),
  }
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    dev: vi.fn(),
    error: vi.fn(),
  }
}));

// Mock server-only to prevent import errors in Vitest
vi.mock("server-only", () => ({}));

describe("auth-cookie security attributes (SEC-02)", () => {
  beforeEach(() => {
    mockSet = vi.fn();
    mockDelete = vi.fn();
    mockGet = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("setAuthCookie", () => {
    it("sets the cookie with httpOnly: true", async () => {
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.httpOnly).toBe(true);
    });

    it("sets the cookie with sameSite: 'lax'", async () => {
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.sameSite).toBe("lax");
    });

    it("sets the cookie with path: '/'", async () => {
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.path).toBe("/");
    });

    it("sets secure: true in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.secure).toBe(true);
    });

    it("sets secure: false outside production", async () => {
      vi.stubEnv("NODE_ENV", "development");
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.secure).toBe(false);
    });

    it("uses the cookie name 'ezygo_access_token'", async () => {
      await setAuthCookie("test-token");
      const [name] = mockSet.mock.calls[0];
      expect(name).toBe("ezygo_access_token");
    });

    it("stores the provided token value", async () => {
      await setAuthCookie("my-secret-token");
      const [, value] = mockSet.mock.calls[0];
      expect(value).toBe("my-secret-token");
    });

    it("sets an expiry ~31 days in the future by default", async () => {
      const before = Date.now();
      await setAuthCookie("test-token");
      const after = Date.now();
      const [, , opts] = mockSet.mock.calls[0];
      const expectedMs = 31 * 24 * 60 * 60 * 1000;
      expect(opts.expires.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
      expect(opts.expires.getTime()).toBeLessThanOrEqual(after + expectedMs + 1000);
    });
  });

  describe("clearAuthCookie", () => {
    it("uses the cookie name 'ezygo_access_token'", async () => {
      await clearAuthCookie();
      expect(mockDelete).toHaveBeenCalledWith("ezygo_access_token");
    });
  });

  describe("getAuthTokenServer", () => {
    it("returns token value if cookie exists", async () => {
      mockGet.mockReturnValue({ value: "stored-token" });
      const token = await getAuthTokenServer();
      expect(token).toBe("stored-token");
      expect(mockGet).toHaveBeenCalledWith("ezygo_access_token");
    });

    it("returns undefined if cookie does not exist", async () => {
      mockGet.mockReturnValue(undefined);
      const token = await getAuthTokenServer();
      expect(token).toBeUndefined();
    });
  });

  describe("getAuthTokenWithFallback", () => {
    it("returns cookie token if available", async () => {
      mockGet.mockReturnValue({ value: "cookie-token" });
      const token = await getAuthTokenWithFallback();
      expect(token).toBe("cookie-token");
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("heals token from database if cookie is missing", async () => {
      mockGet.mockReturnValue(undefined);
      const token = await getAuthTokenWithFallback();
      expect(token).toBe("decrypted-token");
      expect(mockGetUser).toHaveBeenCalled();
      expect(mockMaybeSingle).toHaveBeenCalled();
      // Should also attempt to restore cookie
      expect(mockSet).toHaveBeenCalledWith("ezygo_access_token", "decrypted-token", expect.any(Object));
    });

    it("returns undefined if no user is found in fallback", async () => {
      mockGet.mockReturnValue({ value: undefined });
      mockGetUser.mockResolvedValueOnce({ data: { user: null } } as any);
      const token = await getAuthTokenWithFallback();
      expect(token).toBeUndefined();
    });

    it("returns undefined if database record is missing", async () => {
      mockGet.mockReturnValue({ value: undefined });
      mockMaybeSingle.mockResolvedValueOnce({ data: null } as any);
      const token = await getAuthTokenWithFallback();
      expect(token).toBeUndefined();
    });

    it("handles exceptions gracefully", async () => {
      mockGet.mockReturnValue(undefined);
      mockGetUser.mockRejectedValueOnce(new Error("Supabase error"));
      const token = await getAuthTokenWithFallback();
      expect(token).toBeUndefined();
    });
  });
});
