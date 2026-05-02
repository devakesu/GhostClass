import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isStandalonePWA } from "../pwa";

describe("isStandalonePWA", () => {
  let originalWindow: typeof globalThis.window;
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalWindow = global.window;
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    global.window = originalWindow;
    // @ts-ignore
    global.navigator = originalNavigator;
  });

  it("returns false in non-browser environment", () => {
    const windowBackup = global.window;
    // @ts-ignore
    delete global.window;
    try {
      expect(isStandalonePWA()).toBe(false);
    } finally {
      global.window = windowBackup;
    }
  });

  it("returns true if display-mode is standalone", () => {
    Object.defineProperty(global, "window", {
      writable: true,
      value: {
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
        navigator: {}
      }
    });
    expect(isStandalonePWA()).toBe(true);
    expect(global.window.matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("returns true if navigator.standalone is true (iOS)", () => {
    Object.defineProperty(global, "window", {
      writable: true,
      value: {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: { standalone: true }
      }
    });
    expect(isStandalonePWA()).toBe(true);
  });

  it("returns false if neither matches", () => {
    Object.defineProperty(global, "window", {
      writable: true,
      value: {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: { standalone: false }
      }
    });
    expect(isStandalonePWA()).toBe(false);
  });

  it("handles missing matchMedia gracefully", () => {
    Object.defineProperty(global, "window", {
      writable: true,
      value: {
        navigator: { standalone: true }
      }
    });
    expect(isStandalonePWA()).toBe(true);
  });
});
