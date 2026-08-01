import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBuildInfo } from "../use-build-info";

vi.unmock("../use-build-info");

describe("useBuildInfo", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default build info when environment variables are missing", () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.NEXT_PUBLIC_BRANCH;
    delete process.env.NEXT_PUBLIC_COMMIT;
    delete process.env.NEXT_PUBLIC_IS_LEGACY;
    delete process.env.NEXT_PUBLIC_BUILD_TIMESTAMP;

    const { result } = renderHook(() => useBuildInfo());

    expect(result.current.buildInfo.version).toBe("1.0.0");
    expect(result.current.buildInfo.branch).toBe("main");
    expect(result.current.buildInfo.commit).toBe("test-commit");
    expect(result.current.buildInfo.is_legacy).toBe(false);
    expect(result.current.buildInfo.timestamp).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("returns build info from environment variables", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "2.0.0";
    process.env.NEXT_PUBLIC_BRANCH = "feature-x";
    process.env.NEXT_PUBLIC_COMMIT = "abcdef123";
    process.env.NEXT_PUBLIC_IS_LEGACY = "true";
    process.env.NEXT_PUBLIC_BUILD_TIMESTAMP = "2023-10-27T10:00:00Z";

    const { result } = renderHook(() => useBuildInfo());

    expect(result.current.buildInfo).toEqual({
      version: "2.0.0",
      branch: "feature-x",
      commit: "abcdef123",
      is_legacy: true,
      timestamp: "2023-10-27T10:00:00Z",
    });
  });

  it("maintains data property for compatibility", () => {
    const { result } = renderHook(() => useBuildInfo());
    expect(result.current.data).toEqual(result.current.buildInfo);
  });
});
