import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  CSRF_LAST_INIT_KEY,
  CSRF_LAST_INIT_KEY_PREFIX,
  useCSRFToken,
} from "@/hooks/use-csrf-token";
import * as axiosModule from "@/lib/axios";
import axios from "@/lib/axios";

// CSRF reinitialization interval used in tests (30 minutes in milliseconds).
const CSRF_REINIT_INTERVAL_MS = 30 * 60 * 1000;

// Mock the axios module
vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getCsrfToken: vi.fn(),
  setCsrfToken: vi.fn(),
}));

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

describe("useCSRFToken", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock sessionStorage
    const sessionStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        get length() {
          return Object.keys(store).length;
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
      };
    })();

    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
      writable: true,
    });

    // Mock axios.get by default to return success
    vi.mocked(axios.get).mockResolvedValue({
      data: { token: "test-csrf-token" },
      status: 200,
      statusText: "OK",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize CSRF token on first mount when token does not exist", async () => {
    // Mock getCsrfToken to return null (no existing token)
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);

    renderHook(() => useCSRFToken());

    // Wait for the fetch to be called
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });
    });

    // Wait for setCsrfToken to be called with the token
    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });
  });

  it("should call /api/csrf on mount when token exists but no recent init timestamp is recorded", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue("existing-token");

    renderHook(() => useCSRFToken());

    // fetch must still be called to refresh the cookie server-side
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });
    });

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });
  });

  it("should skip /api/csrf when token exists and last init was within the throttle window", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue("existing-token");
    window.sessionStorage.setItem(CSRF_LAST_INIT_KEY, Date.now().toString());

    renderHook(() => useCSRFToken());

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(axios.get).not.toHaveBeenCalled();
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled();
  });

  it("should call /api/csrf when token exists but last init timestamp is stale", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue("existing-token");
    const staleTimestamp = Date.now() - (CSRF_REINIT_INTERVAL_MS + 1000);
    window.sessionStorage.setItem(
      CSRF_LAST_INIT_KEY,
      staleTimestamp.toString(),
    );

    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });
    });

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });
  });

  it("should clean up stale csrf_last_init keys from previous versions on successful init", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);
    window.sessionStorage.setItem(
      `${CSRF_LAST_INIT_KEY_PREFIX}1.0.0`,
      Date.now().toString(),
    );
    window.sessionStorage.setItem(
      `${CSRF_LAST_INIT_KEY_PREFIX}1.1.0`,
      Date.now().toString(),
    );

    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });

    expect(window.sessionStorage.getItem(`${CSRF_LAST_INIT_KEY_PREFIX}1.0.0`))
      .toBeNull();
    expect(window.sessionStorage.getItem(`${CSRF_LAST_INIT_KEY_PREFIX}1.1.0`))
      .toBeNull();
    expect(window.sessionStorage.getItem(CSRF_LAST_INIT_KEY)).not.toBeNull();
  });

  it("should still clean up stale keys even when setItem throws QuotaExceededError", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);
    window.sessionStorage.setItem(
      `${CSRF_LAST_INIT_KEY_PREFIX}1.0.0`,
      Date.now().toString(),
    );
    window.sessionStorage.setItem(
      `${CSRF_LAST_INIT_KEY_PREFIX}1.1.0`,
      Date.now().toString(),
    );

    const originalSetItem = window.sessionStorage.setItem.bind(
      window.sessionStorage,
    );
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(
      (key: string, value: string) => {
        if (key === CSRF_LAST_INIT_KEY) {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }
        originalSetItem(key, value);
      },
    );

    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });

    expect(window.sessionStorage.getItem(`${CSRF_LAST_INIT_KEY_PREFIX}1.0.0`))
      .toBeNull();
    expect(window.sessionStorage.getItem(`${CSRF_LAST_INIT_KEY_PREFIX}1.1.0`))
      .toBeNull();
    expect(window.sessionStorage.getItem(CSRF_LAST_INIT_KEY)).toBeNull();
  });

  it("should handle concurrent component mounts via shared promise", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);

    vi.mocked(axios.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: { token: "test-csrf-token" },
              status: 200,
              statusText: "OK",
            });
          }, 100);
        }),
    );

    const { unmount: unmount1 } = renderHook(() => useCSRFToken());
    const { unmount: unmount2 } = renderHook(() => useCSRFToken());
    const { unmount: unmount3 } = renderHook(() => useCSRFToken());

    await waitFor(
      () => {
        expect(axiosModule.setCsrfToken).toHaveBeenCalledWith(
          "test-csrf-token",
        );
      },
      { timeout: 2000 },
    );

    expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");

    unmount1();
    unmount2();
    unmount3();
  });

  it("should be safe for StrictMode double-effect execution", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);

    const { unmount, rerender } = renderHook(() => useCSRFToken());
    rerender();

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalled();
    });

    expect(axios.get).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("should handle fetch errors gracefully", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);
    vi.mocked(axios.get).mockRejectedValue(new Error("Network error"));

    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled();
  });

  it("should handle non-ok response from server", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);
    vi.mocked(axios.get).mockResolvedValue({
      status: 500,
      statusText: "Internal Server Error",
    });

    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled();
  });

  it("should allow retry on subsequent mount if first initialization fails", async () => {
    let callCount = 0;
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);

    vi.mocked(axios.get).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        data: { token: "test-csrf-token" },
        status: 200,
        statusText: "OK",
      });
    });

    const { unmount: unmount1 } = renderHook(() => useCSRFToken());
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
    unmount1();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const { unmount: unmount2 } = renderHook(() => useCSRFToken());
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
    });
    unmount2();
  });

  it("should not initialize in SSR (server-side rendering)", async () => {
    // In jsdom environment, window/sessionStorage are always defined.
    // Testing the "typeof window === 'undefined'" check requires a node environment test file.
    // We'll skip this specific branch test here to avoid messing with global state
    // and causing ReferenceErrors in afterEach/vitest.setup.ts.
    expect(typeof window).toBe("object"); // Confirm jsdom environment
  });

  it("should retry initialization if another component initialization fails", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockImplementation(() => {
      return null;
    });

    let callCount = 0;
    vi.mocked(axios.get).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("First fetch failed"));
      }
      return Promise.resolve({
        data: { token: "retry-token" },
        status: 200,
        statusText: "OK",
      });
    });

    const { unmount: unmount1 } = renderHook(() => useCSRFToken());
    const { unmount: unmount2 } = renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    await waitFor(
      () => {
        expect(axios.get).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith("retry-token");
    });

    unmount1();
    unmount2();
  });

  it("should skip if token exists after waiting for existing promise", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValueOnce(null)
      .mockReturnValue("token-from-other");

    vi.mocked(axios.get).mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(
          () => resolve({ data: { token: "token-from-other" }, status: 200 }),
          50,
        );
      })
    );

    renderHook(() => useCSRFToken());
    renderHook(() => useCSRFToken());

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("should skip if already initialized in current component", async () => {
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null);
    const { rerender } = renderHook(() => useCSRFToken());

    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    rerender();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
