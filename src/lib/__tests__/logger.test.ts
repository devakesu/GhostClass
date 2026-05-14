import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
});
