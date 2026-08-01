import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock redis and logger
vi.mock("@/lib/redis", () => ({
  redis: {},
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    dev: vi.fn(),
  },
}));

describe("ratelimit.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("exports rate limiter instances and logs configuration", async () => {
    const {
      syncRateLimiter,
      contactRateLimiter,
      profileRateLimiter,
      authRateLimiter,
      proxyRateLimiter,
    } = await import("../ratelimit");
    expect(syncRateLimiter).toBeDefined();
    expect(contactRateLimiter).toBeDefined();
    expect(profileRateLimiter).toBeDefined();
    expect(authRateLimiter).toBeDefined();
    expect(proxyRateLimiter).toBeDefined();

    const { logger } = await import("@/lib/logger");
    expect(logger.dev).toHaveBeenCalledWith(
      expect.stringContaining("[Rate Limit]"),
    );
  });

  it("validates RATE_LIMIT_REQUESTS", async () => {
    vi.stubEnv("RATE_LIMIT_REQUESTS", "0");
    await expect(import("../ratelimit")).rejects.toThrow(
      "RATE_LIMIT_REQUESTS must be between 1-1000",
    );
  });

  it("validates RATE_LIMIT_WINDOW", async () => {
    vi.stubEnv("RATE_LIMIT_WINDOW", "0");
    await expect(import("../ratelimit")).rejects.toThrow(
      "RATE_LIMIT_WINDOW must be between 1-3600",
    );
  });

  it("validates SYNC_RATE_LIMIT_REQUESTS", async () => {
    vi.stubEnv("SYNC_RATE_LIMIT_REQUESTS", "1001");
    await expect(import("../ratelimit")).rejects.toThrow(
      "SYNC_RATE_LIMIT_REQUESTS must be between 1-1000",
    );
  });

  it("validates CONTACT_RATE_LIMIT_WINDOW", async () => {
    vi.stubEnv("CONTACT_RATE_LIMIT_WINDOW", "4000");
    await expect(import("../ratelimit")).rejects.toThrow(
      "CONTACT_RATE_LIMIT_WINDOW must be between 1-3600",
    );
  });

  it("validates AUTH_RATE_LIMIT_REQUESTS", async () => {
    vi.stubEnv("AUTH_RATE_LIMIT_REQUESTS", "0");
    await expect(import("../ratelimit")).rejects.toThrow(
      "AUTH_RATE_LIMIT_REQUESTS must be between 1-1000",
    );
  });

  it("validates PROXY_RATE_LIMIT_WINDOW", async () => {
    vi.stubEnv("PROXY_RATE_LIMIT_WINDOW", "0");
    await expect(import("../ratelimit")).rejects.toThrow(
      "PROXY_RATE_LIMIT_WINDOW must be between 1-3600",
    );
  });

  it("validates AUTH_RATE_LIMIT_WINDOW", async () => {
    vi.stubEnv("AUTH_RATE_LIMIT_WINDOW", "3601");
    await expect(import("../ratelimit")).rejects.toThrow(
      "AUTH_RATE_LIMIT_WINDOW must be between 1-3600",
    );
  });

  it("throws if PROXY_RATE_LIMIT_REQUESTS is out of range", async () => {
    vi.stubEnv("PROXY_RATE_LIMIT_REQUESTS", "5001");
    await expect(import("../ratelimit")).rejects.toThrow(
      "PROXY_RATE_LIMIT_REQUESTS must be between 1-5000",
    );
  });

  it("throws if SYNC_RATE_LIMIT_WINDOW is out of range", async () => {
    vi.stubEnv("SYNC_RATE_LIMIT_WINDOW", "3601");
    await expect(import("../ratelimit")).rejects.toThrow();
  });

  it("throws if CONTACT_RATE_LIMIT_REQUESTS is out of range", async () => {
    vi.stubEnv("CONTACT_RATE_LIMIT_REQUESTS", "1001");
    await expect(import("../ratelimit")).rejects.toThrow();
  });
});
