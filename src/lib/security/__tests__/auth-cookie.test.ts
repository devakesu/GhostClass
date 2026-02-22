/**
 * Tests for auth-cookie.ts
 *
 * [SEC-02] ezygo_access_token must always be written with HttpOnly, Secure (in
 * production), and SameSite=Strict flags.  The save-token route is the sole
 * writer — this file asserts those security attributes so a future accidental
 * change to the cookie flags is caught by CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthCookie, clearAuthCookie } from "../auth-cookie";

// Mock the Next.js cookies module (same pattern as csrf.test.ts)
let mockSet: ReturnType<typeof vi.fn>;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mockSet })),
}));

describe("auth-cookie security attributes (SEC-02)", () => {
  beforeEach(() => {
    mockSet = vi.fn();
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

    it("sets the cookie with sameSite: 'strict'", async () => {
      await setAuthCookie("test-token");
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.sameSite).toBe("strict");
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
    it("sets the cookie with httpOnly: true", async () => {
      await clearAuthCookie();
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.httpOnly).toBe(true);
    });

    it("sets the cookie with sameSite: 'strict'", async () => {
      await clearAuthCookie();
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.sameSite).toBe("strict");
    });

    it("uses the cookie name 'ezygo_access_token'", async () => {
      await clearAuthCookie();
      const [name] = mockSet.mock.calls[0];
      expect(name).toBe("ezygo_access_token");
    });

    it("sets an expiry in the past to delete the cookie", async () => {
      await clearAuthCookie();
      const [, , opts] = mockSet.mock.calls[0];
      expect(opts.expires.getTime()).toBe(0);
    });
  });
});
