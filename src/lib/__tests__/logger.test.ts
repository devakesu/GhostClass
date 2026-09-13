import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("logger.ts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("dev() logs in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { logger } = await import("../logger");
    logger.dev("test");
    expect(console.log).toHaveBeenCalledWith("test");
  });

  it("dev() does not log in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { logger } = await import("../logger");
    logger.dev("test");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("info() always logs", async () => {
    const { logger } = await import("../logger");
    logger.info("test info");
    expect(console.info).toHaveBeenCalledWith("test info");
  });

  it("warn() and error() do not log in test environment", async () => {
    // process.env.VITEST is true during vitest run
    const { logger } = await import("../logger");
    logger.warn("warning");
    logger.error("error");
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("warn() and error() log when VITEST is not set", async () => {
    vi.stubEnv("VITEST", "");
    const { logger } = await import("../logger");
    logger.warn("warning");
    logger.error("error");
    expect(console.warn).toHaveBeenCalledWith("warning");
    expect(console.error).toHaveBeenCalledWith("error");
  });

  it("buildStructuredPayload properly serializes Error instances instead of empty object", async () => {
    const { buildStructuredPayload } = await import("../logger");
    const testError = new Error("Attendance API: 401");
    (testError as any).code = "EZYGO_AUTH_EXPIRED";

    const payloadStr = buildStructuredPayload("error", [
      "Sync failed for user (u1)",
      testError,
    ]);
    const payload = JSON.parse(payloadStr);

    expect(payload.level).toBe("error");
    expect(payload.msg).toBe("Sync failed for user (u1)");
    expect(payload.meta).toBeDefined();
    expect(payload.meta.name).toBe("Error");
    expect(payload.meta.message).toBe("Attendance API: 401");
    expect(payload.meta.code).toBe("EZYGO_AUTH_EXPIRED");
    expect(payload.meta.stack).toContain("Attendance API: 401");
    expect(payload.meta).not.toEqual([{}]);
  });

  it("buildStructuredPayload handles single Error argument without string message", async () => {
    const { buildStructuredPayload } = await import("../logger");
    const testError = new Error("Database connection timeout");

    const payloadStr = buildStructuredPayload("error", [testError]);
    const payload = JSON.parse(payloadStr);

    expect(payload.level).toBe("error");
    expect(payload.msg).toBe("Database connection timeout");
    expect(payload.meta.name).toBe("Error");
    expect(payload.meta.message).toBe("Database connection timeout");
  });

  it("buildStructuredPayload serializes nested error causes", async () => {
    const { buildStructuredPayload } = await import("../logger");
    const rootCause = new Error("Connection reset by peer");
    const wrapError = new Error("Upstream fetch failed", { cause: rootCause });

    const payloadStr = buildStructuredPayload("error", [
      "Fetch error",
      wrapError,
    ]);
    const payload = JSON.parse(payloadStr);

    expect(payload.meta.message).toBe("Upstream fetch failed");
    expect(payload.meta.cause).toBeDefined();
    expect(payload.meta.cause.message).toBe("Connection reset by peer");
  });

  it("production error() outputs valid structured JSON with serialized error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    const { logger } = await import("../logger");

    const err = new Error("Sync failed token expired");
    logger.error("Sync failed for testuser", err);

    expect(console.error).toHaveBeenCalled();
    const loggedOutput = (console.error as any).mock.calls[0][0];
    const parsed = JSON.parse(loggedOutput);

    expect(parsed.msg).toBe("Sync failed for testuser");
    expect(parsed.meta.message).toBe("Sync failed token expired");
  });
});
