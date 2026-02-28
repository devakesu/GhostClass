import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// vi.mock factories are hoisted to the top of the file, so variables used inside
// them must also be hoisted via vi.hoisted().
const { mockNProgressStart, mockNProgressDone, mockAxiosPost, mockRouter, mockGetSession } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockNProgressStart: vi.fn(),
    mockNProgressDone: vi.fn(),
    mockAxiosPost: vi.fn(),
    // A single stable router object prevents useEffect([router, supabase]) from
    // re-running on every render (which would cause an infinite loop in tests).
    mockRouter: { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
    // Hoisted so it can be used inside the vi.mock factory for @/lib/supabase/client.
    mockGetSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  };
});

// --- Stable router mock (overrides vitest.setup.ts global) ---
// The LoginForm puts `router` in a useEffect dependency array. If useRouter() returns
// a new object on every render (as the global mock does), the effect re-runs on every
// render → infinite loop → act() hangs. A stable reference prevents this.
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// --- Supabase client mock (overrides vitest.setup.ts global) ---
// Uses the hoisted mockGetSession so individual tests can control getSession behavior.
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
}));

// --- NProgress mock ---
vi.mock("nprogress", () => ({
  default: { start: mockNProgressStart, done: mockNProgressDone },
}));

// --- Axios mock ---
vi.mock("axios", () => ({
  default: { post: mockAxiosPost },
  AxiosError: class AxiosError extends Error {
    isAxiosError = true;
    config: Record<string, unknown> = {};
    response?: { status: number; data?: { message?: string } };
    constructor(message?: string) {
      super(message);
      this.name = "AxiosError";
    }
  },
}));

// --- Framer-motion mock ---
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", rest, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  LazyMotion: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  domAnimation: {},
}));

// --- Sentry mock ---
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// --- CSRF hook / token ---
vi.mock("@/hooks/use-csrf-token", () => ({
  useCSRFToken: vi.fn(),
}));
vi.mock("@/lib/axios", () => ({
  getCsrfToken: vi.fn().mockReturnValue("test-csrf-token"),
}));

// --- Logger ---
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

// --- auth helper ---
vi.mock("@/lib/security/auth", () => ({
  isAuthSessionMissingError: vi.fn().mockReturnValue(false),
  isSupabaseLockTimeoutError: vi.fn().mockReturnValue(false),
}));

// --- Password-reset form ---
vi.mock("../password-reset-form", () => ({
  PasswordResetForm: () => React.createElement("div", { "data-testid": "password-reset-form" }),
}));

// --- User settings provider ---
vi.mock("@/providers/user-settings", () => ({
  DEFAULT_TARGET_PERCENTAGE: 75,
}));

// --- CSRF constants ---
vi.mock("@/lib/security/csrf-constants", () => ({
  CSRF_HEADER: "x-csrf-token",
}));

import { LoginForm } from "../login-form";
import { isAuthSessionMissingError, isSupabaseLockTimeoutError } from "@/lib/security/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAndWaitForForm() {
  render(<LoginForm />);
  // Wait for the password input to appear – the form renders immediately on mount,
  // even while the mount-time auth/session check may still be in progress.
  return screen.findByLabelText("Password");
}

function fillValidForm(passwordInput: HTMLElement) {
  fireEvent.change(screen.getByPlaceholderText("academic_weapon_fr"), {
    target: { value: "testuser" },
  });
  fireEvent.change(passwordInput, {
    target: { value: "password123" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginForm – NProgress integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockGetSession to default (no session, no error) before each test.
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    // Reset auth helpers to default (both return false).
    vi.mocked(isAuthSessionMissingError).mockReturnValue(false);
    vi.mocked(isSupabaseLockTimeoutError).mockReturnValue(false);
  });

  it("calls NProgress.start() when the form is submitted", async () => {
    // Resolve immediately so the test doesn't hang
    mockAxiosPost.mockResolvedValue({ data: { access_token: "tok" } });

    const passwordInput = await renderAndWaitForForm();
    fillValidForm(passwordInput);

    await act(async () => {
      fireEvent.submit(passwordInput.closest("form")!);
    });

    expect(mockNProgressStart).toHaveBeenCalled();
  });

  it("calls NProgress.done() when the form submission throws an error", async () => {
    // Make axios.post reject to trigger the catch block
    mockAxiosPost.mockRejectedValue(new Error("network error"));

    const passwordInput = await renderAndWaitForForm();
    fillValidForm(passwordInput);

    await act(async () => {
      fireEvent.submit(passwordInput.closest("form")!);
    });

    await waitFor(() => expect(mockNProgressDone).toHaveBeenCalled());
  });
});

describe("LoginForm – mount-time storage cleanup", () => {
  // Replace the global Storage objects with mocks so we can reliably track calls.
  // vi.spyOn on the Storage prototype can fail silently in jsdom.
  let mockLocalStorage: { clear: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn>; getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; key: ReturnType<typeof vi.fn>; length: number };
  let mockSessionStorage: { clear: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn>; getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; key: ReturnType<typeof vi.fn>; length: number };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth helpers and session mock to clean defaults.
    vi.mocked(isAuthSessionMissingError).mockReturnValue(false);
    vi.mocked(isSupabaseLockTimeoutError).mockReturnValue(false);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    mockLocalStorage = { clear: vi.fn(), removeItem: vi.fn(), getItem: vi.fn(), setItem: vi.fn(), key: vi.fn(), length: 0 };
    mockSessionStorage = { clear: vi.fn(), removeItem: vi.fn(), getItem: vi.fn(), setItem: vi.fn(), key: vi.fn(), length: 0 };
    Object.defineProperty(global, "localStorage", { writable: true, configurable: true, value: mockLocalStorage });
    Object.defineProperty(global, "sessionStorage", { writable: true, configurable: true, value: mockSessionStorage });
  });

  it("clears localStorage and sessionStorage when there is no session and no error", async () => {
    // Default: getSession returns { session: null, error: null }.
    // isAuthSessionMissingError and isSupabaseLockTimeoutError both return false.
    render(<LoginForm />);
    // Use waitFor because checkUser() is async: render() resolves immediately on the
    // initial (pre-loading) frame, before the useEffect async session check completes.
    await waitFor(() => expect(mockLocalStorage.clear).toHaveBeenCalled());
    expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("prefetchedSettings");
  });

  it("clears localStorage and sessionStorage when there is no session and the error is a session-missing error", async () => {
    const sessionError = new Error("Auth session missing");
    mockGetSession.mockResolvedValue({ data: { session: null }, error: sessionError });
    vi.mocked(isAuthSessionMissingError).mockReturnValue(true);

    render(<LoginForm />);
    await waitFor(() => expect(mockLocalStorage.clear).toHaveBeenCalled());
    expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("prefetchedSettings");
  });

  it("does not clear storage when getSession returns a lock-timeout error", async () => {
    const lockError = new Error(
      "Exclusive Navigator LockManager lock timed out on auth-token",
    );
    mockGetSession.mockResolvedValue({ data: { session: null }, error: lockError });
    vi.mocked(isSupabaseLockTimeoutError).mockReturnValue(true);

    render(<LoginForm />);
    // Wait for the session check to have run (mockGetSession called), then flush
    // remaining async work so the effect has fully completed before asserting.
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    await act(async () => {});
    expect(mockLocalStorage.clear).not.toHaveBeenCalled();
    expect(mockSessionStorage.removeItem).not.toHaveBeenCalledWith("prefetchedSettings");
  });
});

describe("LoginForm – EzyGo credential error message override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    vi.mocked(isAuthSessionMissingError).mockReturnValue(false);
    vi.mocked(isSupabaseLockTimeoutError).mockReturnValue(false);
  });

  it("overrides the EzyGo 'our records' message with 'EzyGo records'", async () => {
    const err = new (vi.mocked(await import("axios")).AxiosError)("Wrong password");
    err.config = { url: "/api/backend/login", headers: {} } as unknown as import("axios").InternalAxiosRequestConfig;
    err.response = {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: {},
      config: err.config,
      data: { message: "These credentials do not match our records." },
    } as unknown as import("axios").AxiosResponse;
    mockAxiosPost.mockRejectedValue(err);

    const passwordInput = await renderAndWaitForForm();
    fillValidForm(passwordInput);

    await act(async () => {
      fireEvent.submit(passwordInput.closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getAllByText("These credentials do not match EzyGo records.").length).toBeGreaterThan(0)
    );
  });

  it("passes through unrelated EzyGo error messages unchanged", async () => {
    const err = new (vi.mocked(await import("axios")).AxiosError)("Other error");
    err.config = { url: "/api/backend/login", headers: {} } as unknown as import("axios").InternalAxiosRequestConfig;
    err.response = {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: {},
      config: err.config,
      data: { message: "Some other error from EzyGo." },
    } as unknown as import("axios").AxiosResponse;
    mockAxiosPost.mockRejectedValue(err);

    const passwordInput = await renderAndWaitForForm();
    fillValidForm(passwordInput);

    await act(async () => {
      fireEvent.submit(passwordInput.closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getAllByText("Some other error from EzyGo.").length).toBeGreaterThan(0)
    );
  });
});
