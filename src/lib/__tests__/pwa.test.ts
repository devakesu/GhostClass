import { afterEach, describe, expect, it, vi } from "vitest";
import { isStandalonePWA } from "../pwa";

describe("isStandalonePWA", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns false in non-browser environment", () => {
    vi.stubGlobal("window", undefined);
    expect(isStandalonePWA()).toBe(false);
  });

  it("returns true if display-mode is standalone", () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", {
      matchMedia: matchMediaMock,
      navigator: {},
    });
    expect(isStandalonePWA()).toBe(true);
    expect(matchMediaMock).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("returns true if navigator.standalone is true (iOS)", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: { standalone: true },
    });
    expect(isStandalonePWA()).toBe(true);
  });

  it("returns false if neither matches", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: { standalone: false },
    });
    expect(isStandalonePWA()).toBe(false);
  });

  it("handles missing matchMedia gracefully", () => {
    vi.stubGlobal("window", {
      navigator: { standalone: true },
    });
    expect(isStandalonePWA()).toBe(true);
  });
});
