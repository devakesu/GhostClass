import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// vi.mock factories are hoisted to the top of the file, so variables used inside
// them must also be hoisted via vi.hoisted().
const { mockNProgressStart, mockNProgressDone, mockAxiosPost, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockNProgressStart: vi.fn(),
    mockNProgressDone: vi.fn(),
    mockAxiosPost: vi.fn(),
    // A single stable router object prevents useEffect([router, supabase]) from
    // re-running on every render (which would cause an infinite loop in tests).
    mockRouter: { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAndWaitForForm() {
  render(<LoginForm />);
  // Wait for the password input to appear – this only shows when isLoadingPage=false
  // (i.e., after the mount-time auth check has completed and the form is stable).
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
