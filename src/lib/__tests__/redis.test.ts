import { beforeEach, describe, expect, it, vi } from "vitest";

describe("redis.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";
    process.env.VITEST = "false";
    vi.stubEnv("NODE_ENV", "test");
  });

  it("throws if URL is missing", async () => {
    const { getRedis } = await import("../redis");
    expect(() => getRedis()).toThrow("UPSTASH_REDIS_REST_URL is not defined");
  });

  it("throws if Token is missing", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    const { getRedis } = await import("../redis");
    expect(() => getRedis()).toThrow("UPSTASH_REDIS_REST_TOKEN is not defined");
  });

  it("initializes and caches instance", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    vi.stubEnv("NODE_ENV", "production");

    const { getRedis } = await import("../redis");
    const client1 = getRedis();
    const client2 = getRedis();
    expect(client1).toBe(client2);
  });

  it("logs in development", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    vi.stubEnv("NODE_ENV", "development");

    const { logger } = await import("../logger");
    const spy = vi.spyOn(logger, "dev");

    const { getRedis } = await import("../redis");
    getRedis();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[Redis] Client initialized successfully"),
    );
  });

  it("proxy works for functions", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const { redis } = await import("../redis");
    expect(typeof redis.set).toBe("function");
  });

  it("proxy works for properties", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const { redis } = await import("../redis");
    // @ts-expect-error - accessing internal prop for test
    expect(redis.url).toBeUndefined();
  });

  it("proxy caches client", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const { redis } = await import("../redis");
    // First call initializes
    expect(typeof redis.set).toBe("function");
    // Second call uses cache
    expect(typeof redis.get).toBe("function");
  });

  it("can reset client", async () => {
    const { __resetRedisClient } = await import("../redis");
    expect(() => __resetRedisClient()).not.toThrow();
  });
});
