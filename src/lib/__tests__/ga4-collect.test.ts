/**
 * Tests for GA4 Collect Library
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ga4Collect } from "../ga4-collect";

const loggerSpy = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: loggerSpy,
}));

describe("ga4-collect", () => {
  const measurementId = "G-TEST123";
  const payload = { test: "data" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK",
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should skip sending if GA_API_SECRET is missing", async () => {
    vi.stubEnv("GA_API_SECRET", "");
    await ga4Collect(measurementId, payload);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should send event with secret in URL in production", async () => {
    vi.stubEnv("GA_API_SECRET", "secret-123");
    await ga4Collect(measurementId, payload);

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("api_secret=secret-123"),
      }),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("should log error if fetch fails", async () => {
    vi.stubEnv("GA_API_SECRET", "secret-123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Internal Server Error",
    }));

    await ga4Collect(measurementId, payload);

    expect(loggerSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to send event"),
        "Internal Server Error"
    );
  });
});
