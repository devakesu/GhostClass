import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAllowedHostsCache,
  getAllowedHosts,
  normalizeHost,
  resolveRequestHostname,
} from "../origin-validation";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

describe("Origin Validation Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAllowedHostsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getAllowedHosts", () => {
    it("returns null if NEXT_PUBLIC_APP_DOMAIN is not set", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
      expect(getAllowedHosts()).toBeNull();
    });

    it("parses and caches a valid hostname", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "example.com");
      const hosts = getAllowedHosts();
      expect(hosts?.has("example.com")).toBe(true);
      expect(hosts?.size).toBe(1);

      // Verify caching: second call doesn't re-parse
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "different.com");
      vi.stubEnv("NODE_ENV", "production");
      expect(getAllowedHosts()?.has("example.com")).toBe(true);
    });

    it("invalidates cache in development when env changes", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "dev1.com");
      expect(getAllowedHosts()?.has("dev1.com")).toBe(true);

      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "dev2.com");
      expect(getAllowedHosts()?.has("dev2.com")).toBe(true);
    });

    it("strips port numbers from APP_DOMAIN", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "localhost:3000");
      expect(getAllowedHosts()?.has("localhost")).toBe(true);
    });

    it("throws error if APP_DOMAIN contains protocol", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "https://example.com");
      expect(() => getAllowedHosts()).toThrow(
        "Configuration error: NEXT_PUBLIC_APP_DOMAIN must be hostname only",
      );
    });
  });

  describe("normalizeHost", () => {
    it("strips ports from IPv4/hostnames", () => {
      expect(normalizeHost("example.com:8080")).toBe("example.com");
    });

    it("handles bracketed IPv6", () => {
      expect(normalizeHost("[::1]:3000")).toBe("::1");
    });

    it("handles unbracketed IPv6", () => {
      expect(normalizeHost("::1")).toBe("::1");
      expect(normalizeHost("2001:db8:0:0:0:0:0:1")).toBe(
        "2001:db8:0:0:0:0:0:1",
      );
    });

    it("handles multiple values in header (uses first)", () => {
      expect(normalizeHost("first.com, second.com")).toBe("first.com");
    });

    it("returns null for empty values", () => {
      expect(normalizeHost(null)).toBeNull();
      expect(normalizeHost("")).toBeNull();
    });
  });

  describe("resolveRequestHostname", () => {
    it("prefers x-forwarded-host", () => {
      const req = {
        headers: new Headers({
          "x-forwarded-host": "proxy.com:443",
          "host": "direct.com",
        }),
        nextUrl: { hostname: "internal.com" },
      } as unknown as NextRequest;
      expect(resolveRequestHostname(req)).toBe("proxy.com");
    });

    it("falls back to host then nextUrl", () => {
      const reqHost = {
        headers: new Headers({ "host": "direct.com:80" }),
        nextUrl: { hostname: "internal.com" },
      } as unknown as NextRequest;
      expect(resolveRequestHostname(reqHost)).toBe("direct.com");

      const reqUrl = {
        headers: new Headers({}),
        nextUrl: { hostname: "internal.com" },
      } as unknown as NextRequest;
      expect(resolveRequestHostname(reqUrl)).toBe("internal.com");
    });
  });

  describe("Branch Coverage", () => {
    it("skips dev logging in production for getAllowedHosts", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "prod.com");

      const hosts = getAllowedHosts();
      expect(hosts?.has("prod.com")).toBe(true);
    });

    it("handles URL parsing failure in getAllowedHosts", () => {
      // "[" is invalid in hostname and will throw in new URL("https://[")
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "[");
      const hosts = getAllowedHosts();
      expect(hosts?.has("[")).toBe(true);
    });

    it("handles malformed bracketed IPv6", () => {
      expect(normalizeHost("[invalid")).toBe("[invalid");
    });

    it("handles empty comma list in normalizeHost", () => {
      expect(normalizeHost(" , ")).toBeNull();
    });
  });
});
