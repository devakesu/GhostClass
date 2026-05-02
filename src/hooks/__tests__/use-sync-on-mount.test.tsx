import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSyncOnMount } from "../use-sync-on-mount";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/utils", () => ({
  redact: vi.fn((_type, val) => `redacted-${val}`),
}));

vi.mock("@/lib/sentry-lazy", () => ({
  captureSentryException: vi.fn(),
  captureSentryMessage: vi.fn(),
}));

describe("useSyncOnMount", () => {
  const defaultOptions = {
    username: "test-user",
    userId: "123",
    sentryLocation: "TestPage",
    sentryTag: "test_sync",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.useRealTimers();
  });

  it("should start syncing on mount when enabled", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncCompleted).toBe(true);
    }, { timeout: 10000 });

    expect(global.fetch).toHaveBeenCalledWith("/api/cron/sync", expect.any(Object));
  });

  it("should not sync if disabled", () => {
    const { result } = renderHook(() => useSyncOnMount({ ...defaultOptions, enabled: false }));

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncCompleted).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should not sync if username is missing but userId is present (short-circuit)", () => {
    const { result } = renderHook(() => useSyncOnMount({ ...defaultOptions, username: undefined }));

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncCompleted).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should handle 207 Partial Content", async () => {
    const onPartialSync = vi.fn();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 207,
      json: async () => ({ success: true, errors: 1 }),
    });

    renderHook(() => useSyncOnMount({ ...defaultOptions, onPartialSync }));

    await waitFor(() => {
      expect(onPartialSync).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it("should handle successful sync with updates", async () => {
    const onSuccess = vi.fn();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, updates: 1 }),
    });

    renderHook(() => useSyncOnMount({ ...defaultOptions, onSuccess }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it("should handle fetch error", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network Error"));

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncCompleted).toBe(true);
    }, { timeout: 10000 });

    expect(logger.error).toHaveBeenCalled();
  });

  it("should handle non-ok response", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncCompleted).toBe(true);
    }, { timeout: 10000 });

    expect(logger.error).toHaveBeenCalled();
  });

  it("should deduplicate multiple effect runs (Strict Mode simulation)", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { rerender } = renderHook(() => useSyncOnMount(defaultOptions));

    // Re-render immediately (as Strict Mode does)
    rerender();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }, { timeout: 10000 });
  });

  it("should handle AbortError and log it", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    (global.fetch as any).mockRejectedValueOnce(abortError);

    renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(logger.dev).toHaveBeenCalledWith(expect.stringContaining("Sync request aborted"));
    }, { timeout: 10000 });
  });

  it("should abort in-flight request on unmount", async () => {
    const abortSpy = vi.fn();
    
    class MockAbortController {
      abort = abortSpy;
      signal = {} as any;
    }
    vi.stubGlobal("AbortController", MockAbortController);

    (global.fetch as any).mockImplementation(() => new Promise(() => {}));

    const { unmount } = renderHook(() => useSyncOnMount(defaultOptions));
    
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });

  it('should skip state updates if unmounted after fetch', async () => {
    let resolveFetch: (v: any) => void;
    (global.fetch as any).mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const { unmount } = renderHook(() => useSyncOnMount(defaultOptions));
    
    unmount();
    
    // Complete fetch after unmount
    // @ts-expect-error - resolveFetch is assigned
    resolveFetch({
      ok: true,
      json: async () => ({ success: true }),
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    // Should not have logged "Sync completed" for this mount because it was cleaned up
    expect(logger.dev).not.toHaveBeenCalledWith(expect.stringContaining('Sync completed for mount'));
  });

  it('should skip state updates if unmounted after fetch error', async () => {
    let rejectFetch: (v: any) => void;
    (global.fetch as any).mockImplementation(() => new Promise((_, reject) => {
      rejectFetch = reject;
    }));

    const { unmount } = renderHook(() => useSyncOnMount(defaultOptions));
    
    unmount();
    
    // Fail fetch after unmount
    // @ts-expect-error - rejectFetch is assigned
    rejectFetch(new Error('Post-unmount fail'));

    await new Promise(resolve => setTimeout(resolve, 50));
    // Should not have logged error because it was cleaned up
    expect(logger.error).not.toHaveBeenCalled();
  });
});
