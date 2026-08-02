import { renderHook, waitFor } from "@testing-library/react";
vi.unmock("../use-sync-on-mount");
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetModuleState, useSyncOnMount } from "../use-sync-on-mount";
import { logger } from "@/lib/logger";
import axios from "@/lib/axios";

vi.mock("@/lib/logger", () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
  },
  isAxiosError: vi.fn((err) => err?.isAxiosError === true),
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
    vi.useRealTimers();
    _resetModuleState();
  });

  it("should start syncing on mount when enabled", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: { success: true },
    });

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncSettled).toBe(true);
    }, { timeout: 10000 });

    expect(axios.get).toHaveBeenCalledWith(
      "/api/cron/sync",
      expect.any(Object),
    );
  });

  it("should not sync if disabled", () => {
    const { result } = renderHook(() =>
      useSyncOnMount({ ...defaultOptions, enabled: false })
    );

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncSettled).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("should not sync if username is missing but userId is present (short-circuit)", () => {
    const { result } = renderHook(() =>
      useSyncOnMount({ ...defaultOptions, username: undefined })
    );

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncSettled).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("should handle 207 Partial Content", async () => {
    const onPartialSync = vi.fn();
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 207,
      data: { success: true, errors: 1 },
    });

    renderHook(() => useSyncOnMount({ ...defaultOptions, onPartialSync }));

    await waitFor(() => {
      expect(onPartialSync).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it("should handle successful sync with updates", async () => {
    const onSuccess = vi.fn();
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: { success: true, updates: 1 },
    });

    renderHook(() => useSyncOnMount({ ...defaultOptions, onSuccess }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it("should handle axios error", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network Error"));

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncSettled).toBe(true);
    }, { timeout: 10000 });

    expect(logger.error).toHaveBeenCalled();
  });

  it("should handle non-ok response", async () => {
    const axiosError = new Error("Bad Request");
    (axiosError as any).isAxiosError = true;
    (axiosError as any).response = { status: 400, data: {} };
    vi.mocked(axios.get).mockRejectedValueOnce(axiosError);

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(result.current.syncSettled).toBe(true);
    }, { timeout: 10000 });

    expect(logger.error).toHaveBeenCalled();
  });

  it("should deduplicate multiple effect runs (Strict Mode simulation)", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const { rerender } = renderHook(() => useSyncOnMount(defaultOptions));

    // Re-render immediately (as Strict Mode does)
    rerender();

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    }, { timeout: 10000 });
  });

  it("should handle AbortError and log it", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "CanceledError"; // Axios uses CanceledError for aborts
    (abortError as any).isAxiosError = true;
    vi.mocked(axios.get).mockRejectedValueOnce(abortError);

    renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(logger.dev).toHaveBeenCalledWith(
        expect.stringContaining("Sync request aborted"),
      );
    }, { timeout: 10000 });
  });

  it("should share in-flight request across concurrent mounts", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const { result: r1 } = renderHook(() => useSyncOnMount(defaultOptions));
    const { result: r2 } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(r1.current.syncSettled).toBe(true);
      expect(r2.current.syncSettled).toBe(true);
    });

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("should skip state updates if unmounted after request", async () => {
    let resolveAxios: (v: any) => void;
    vi.mocked(axios.get).mockImplementation(() =>
      new Promise((resolve) => {
        resolveAxios = resolve;
      })
    );

    const { unmount } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalled();
    });

    unmount();

    // Complete axios after unmount
    // @ts-expect-error - resolveAxios is assigned
    resolveAxios({
      status: 200,
      data: { success: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Verify no errors thrown and request resolves cleanly in background
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should skip state updates if unmounted after request error", async () => {
    let rejectAxios: (v: any) => void;
    vi.mocked(axios.get).mockImplementation(() =>
      new Promise((_, reject) => {
        rejectAxios = reject;
      })
    );

    const { unmount } = renderHook(() => useSyncOnMount(defaultOptions));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalled();
    });

    unmount();

    // Fail axios after unmount
    // @ts-expect-error - rejectAxios is assigned
    rejectAxios(new Error("Post-unmount fail"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Verify no log error was recorded since the component had unmounted
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should defer sync until the load event if document is not fully loaded", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const originalReadyState = document.readyState;
    Object.defineProperty(document, "readyState", {
      get() {
        return "loading";
      },
      configurable: true,
    });

    const { result } = renderHook(() => useSyncOnMount(defaultOptions));

    expect(result.current.isSyncing).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    }, { timeout: 10000 });

    Object.defineProperty(document, "readyState", {
      get() {
        return originalReadyState;
      },
      configurable: true,
    });
  });
});
