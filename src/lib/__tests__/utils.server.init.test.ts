import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

describe("utils.server.ts (Initialization)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubGlobal("console", { warn: vi.fn(), log: vi.fn() });
  });

  it("throws in production if salt is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_HASH_SALT", "");
    const { redact } = await import("@/lib/utils.server");
    expect(() => redact("id", "v")).toThrow(
      "SENTRY_HASH_SALT is required in production",
    );
  });

  it("warns in development if salt is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SENTRY_HASH_SALT", "");
    const { redact } = await import("@/lib/utils.server");
    redact("id", "v");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Using fallback salt"),
    );
  });

  it("warns once for IP detection in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEST_CLIENT_IP", "");
    const { getClientIp } = await import("@/lib/utils.server");
    getClientIp(new Headers());
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("DEVELOPMENT MODE: Client IP Detection"),
    );

    // Call again, should not warn again
    vi.mocked(console.warn).mockClear();
    getClientIp(new Headers());
    expect(console.warn).not.toHaveBeenCalled();
  });
});
