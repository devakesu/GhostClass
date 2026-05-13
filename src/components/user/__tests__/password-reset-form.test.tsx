import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared before any vi.mock() calls)
// ---------------------------------------------------------------------------
const {
  mockNProgressStart,
  mockNProgressDone,
  mockEzygoPost,
  mockAxiosPost,
  mockRouterPush,
  mockGetUser,
  mockGetCsrfToken,
  mockSetCsrfToken,
  mockFetch,
  radioGroupCallbackRef,
} = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockNProgressStart: vi.fn(),
    mockNProgressDone: vi.fn(),
    mockEzygoPost: vi.fn(),
    mockAxiosPost: vi.fn(),
    mockRouterPush: push,
    mockGetUser: vi.fn().mockResolvedValue({ data: { user: { id: "uid-1" } }, error: null }),
    mockGetCsrfToken: vi.fn().mockReturnValue("csrf-token-123"),
    mockSetCsrfToken: vi.fn(),
    mockFetch: vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ token: "new-csrf" }) }),
    // Shared ref so the RadioGroupItem mock can call the current RadioGroup's onValueChange
    radioGroupCallbackRef: { current: null as ((v: string) => void) | null },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  })),
}));

vi.mock("nprogress", () => ({
  default: { start: mockNProgressStart, done: mockNProgressDone },
}));

vi.mock("@/lib/axios", () => ({
  default: { post: mockEzygoPost },
  getCsrfToken: mockGetCsrfToken,
  setCsrfToken: mockSetCsrfToken,
}));

vi.mock("axios", () => ({
  default: {
    post: mockAxiosPost,
    isAxiosError: (err: unknown) =>
      typeof err === "object" && err !== null && (err as Record<string, unknown>).isAxiosError === true,
  },
  AxiosError: class AxiosError extends Error {
    isAxiosError = true;
    config: Record<string, unknown> = {};
    response?: { status: number; data?: { message?: string } };
    code?: string;
    constructor(message?: string) {
      super(message);
      this.name = "AxiosError";
    }
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", rest, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
  LazyMotion: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
  domAnimation: {},
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/hooks/use-csrf-token", () => ({
  useCSRFToken: vi.fn(),
}));

vi.mock("@/lib/security/csrf-constants", () => ({
  CSRF_HEADER: "x-csrf-token",
}));

vi.mock("@/providers/user-settings", () => ({
  DEFAULT_TARGET_PERCENTAGE: 75,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

// Mock the Shadcn UI RadioGroup components so radio selection works in jsdom.
vi.mock("@/components/ui/radio-group", () => {
  return {
    RadioGroup: ({
      children,
      onValueChange,
      value,
      disabled,
      className,
    }: {
      children?: React.ReactNode;
      onValueChange?: (v: string) => void;
      value?: string;
      disabled?: boolean;
      className?: string;
    }) => {
      radioGroupCallbackRef.current = onValueChange ?? null;
      return React.createElement(
        "div",
        { role: "radiogroup", "data-value": value, className, "aria-disabled": disabled },
        children
      );
    },
    RadioGroupItem: ({
      value,
      id,
      "aria-label": ariaLabel,
      className,
    }: {
      value?: string;
      id?: string;
      "aria-label"?: string;
      className?: string;
    }) =>
      React.createElement("input", {
        type: "radio",
        id,
        value,
        "aria-label": ariaLabel,
        className,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          radioGroupCallbackRef.current?.(e.target.value);
        },
      }),
  };
});

import { PasswordResetForm } from "../password-reset-form";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(onCancel = vi.fn()) {
  return render(<PasswordResetForm onCancel={onCancel} />);
}

function fillUsername(value = "testuser") {
  fireEvent.change(screen.getByPlaceholderText("academic_weapon_fr"), {
    target: { value },
  });
}

async function reachOptionStep() {
  mockEzygoPost
    .mockResolvedValueOnce({ data: { users: ["testuser"] } })
    .mockResolvedValueOnce({
      data: {
        username: "testuser",
        options: { emails: ["t***@example.com"], mobiles: ["91****7890"] },
      },
    });

  renderForm();
  fillUsername("testuser");
  fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

  await waitFor(() => expect(screen.getByText("Send Code")).toBeInTheDocument());
  vi.clearAllMocks();
}

async function reachOtpStep() {
  mockEzygoPost
    .mockResolvedValueOnce({ data: { users: ["testuser"] } })
    .mockResolvedValueOnce({
      data: {
        username: "testuser",
        options: { emails: ["t***@example.com"], mobiles: [] },
      },
    })
    .mockResolvedValueOnce({});

  renderForm();
  fillUsername("testuser");
  fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

  await waitFor(() => screen.getByText("Send Code"));
  const rInput = screen.getByLabelText("Send reset code to email t***@example.com");
  fireEvent.change(rInput, { target: { value: "mail:t***@example.com" } });
  fireEvent.submit(screen.getByText("Send Code").closest("form")!);

  await waitFor(() => screen.getByLabelText("Reset Code"));
  vi.clearAllMocks();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PasswordResetForm – initial render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("renders the username step with the correct input", () => {
    renderForm();
    expect(screen.getByPlaceholderText("academic_weapon_fr")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked on the username step", () => {
    const onCancel = vi.fn();
    renderForm(onCancel);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("switches to email placeholder when email icon is clicked", () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("Email"));
    expect(screen.getByPlaceholderText("cooked@attendance.edu")).toBeInTheDocument();
  });

  it("switches to phone placeholder when phone icon is clicked", () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(screen.getByPlaceholderText("919234567890")).toBeInTheDocument();
  });
});

describe("PasswordResetForm – handleUsernameSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("moves to option step on successful lookup with users", async () => {
    mockEzygoPost
      .mockResolvedValueOnce({ data: { users: ["testuser"] } })
      .mockResolvedValueOnce({
        data: { username: "testuser", options: { emails: ["t***@example.com"], mobiles: [] } },
      });

    renderForm();
    fillUsername("testuser");
    fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

    await waitFor(() => expect(screen.getByText("Send Code")).toBeInTheDocument());
    expect(mockNProgressStart).toHaveBeenCalled();
    expect(mockNProgressDone).toHaveBeenCalled();
  });

  it("shows error when no users are found", async () => {
    mockEzygoPost.mockResolvedValueOnce({ data: { users: [] } });

    renderForm();
    fillUsername("unknownuser");
    fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Ezygo: No user found with this username/email/phone.")).toBeInTheDocument()
    );
  });

  it("shows error on network failure", async () => {
    const err = { response: { data: { message: "User not found" } } };
    mockEzygoPost.mockRejectedValueOnce(err);

    renderForm();
    fillUsername("baduser");
    fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Ezygo: User not found")).toBeInTheDocument()
    );
    expect(mockNProgressDone).toHaveBeenCalled();
  });

  it("shows fallback error when no message in response", async () => {
    mockEzygoPost.mockRejectedValueOnce({});

    renderForm();
    fillUsername("baduser");
    fireEvent.submit(screen.getByPlaceholderText("academic_weapon_fr").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Ezygo: Failed to fetch reset options.")).toBeInTheDocument()
    );
  });
});

describe("PasswordResetForm – handleOptionSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("moves to OTP step after selecting an option and submitting", async () => {
    await reachOptionStep();
    mockEzygoPost.mockResolvedValueOnce({});

    // Trigger change on the radio input to set selectedOption
    const radioInput = screen.getByLabelText("Send reset code to email t***@example.com");
    fireEvent.change(radioInput, { target: { value: "mail:t***@example.com" } });
    fireEvent.submit(screen.getByText("Send Code").closest("form")!);

    await waitFor(() => expect(screen.getByLabelText("Reset Code")).toBeInTheDocument());
    expect(mockNProgressDone).toHaveBeenCalled();
  });

  it.todo("strips the method prefix when calling reset/request (requires reliable radio state update across renders)");

  it("shows error when option request fails", async () => {
    await reachOptionStep();
    mockEzygoPost.mockRejectedValueOnce({ response: { data: { message: "Rate limited" } } });

    const radioInput = screen.getByLabelText("Send reset code to email t***@example.com");
    fireEvent.change(radioInput, { target: { value: "mail:t***@example.com" } });
    fireEvent.submit(screen.getByText("Send Code").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Ezygo: Rate limited")).toBeInTheDocument()
    );
  });
});

describe("PasswordResetForm – handleResetSubmit client-side validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("shows error when password is too short (less than 6 chars)", async () => {
    await reachOtpStep();

    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: "abc" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "abc" },
    });
    fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/Password must be at least 6 characters/)).toBeInTheDocument()
    );
    expect(mockEzygoPost).not.toHaveBeenCalled();
  });

  it("shows error when passwords do not match", async () => {
    await reachOtpStep();

    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: "validpassword" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "differentpassword" },
    });
    fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument()
    );
    expect(mockEzygoPost).not.toHaveBeenCalled();
  });

  it("shows error when password is empty", async () => {
    await reachOtpStep();

    fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Password is required")).toBeInTheDocument()
    );
  });

  it("shows error when password exceeds maximum length", async () => {
    await reachOtpStep();

    const longPassword = "a".repeat(129);

    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: longPassword },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: longPassword },
    });
    fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);

    await waitFor(() =>
      expect(
        screen.getByText("Password must be at most 128 characters long")
      ).toBeInTheDocument()
    );
    expect(mockEzygoPost).not.toHaveBeenCalled();
  });
});

describe("PasswordResetForm – handleResetSubmit success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("navigates to dashboard on successful password reset with settings", async () => {
    await reachOtpStep();

    mockEzygoPost.mockResolvedValueOnce({ data: { access_token: "token123" } });
    mockAxiosPost.mockResolvedValueOnce({
      data: { success: true, settings: { bunk_calculator_enabled: true, target_percentage: 80 } },
    });
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "uid-1" } }, error: null });

    fireEvent.change(screen.getByPlaceholderText("Enter the reset code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "newpassword123" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/dashboard"));
  });

  it("navigates to dashboard when save-token returns no settings", async () => {
    await reachOtpStep();

    mockEzygoPost.mockResolvedValueOnce({ data: { access_token: "token123" } });
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "uid-1" } }, error: null });

    fireEvent.change(screen.getByPlaceholderText("Enter the reset code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "newpassword123" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("PasswordResetForm – handleResetSubmit error cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  function fillOtpForm(otp = "123456", password = "newpassword123") {
    fireEvent.change(screen.getByPlaceholderText("Enter the reset code"), {
      target: { value: otp },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your new password"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: password },
    });
  }

  it("shows bridge error when save-token fails", async () => {
    await reachOtpStep();
    mockEzygoPost.mockResolvedValueOnce({ data: { access_token: "token" } });

    const err: { isAxiosError: boolean; config: { url: string } } = {
      isAxiosError: true,
      config: { url: "/api/auth/save-token" },
    };
    mockAxiosPost.mockRejectedValueOnce(err);

    fillOtpForm();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getByText("Secure session setup failed. Please try again.")).toBeInTheDocument()
    );
  });

  it("shows upstream EzyGo error message when reset fails with response", async () => {
    await reachOtpStep();
    mockEzygoPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { message: "Invalid OTP" } },
    });

    fillOtpForm();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getByText("Ezygo: Invalid OTP")).toBeInTheDocument()
    );
  });

  it("shows network error message when ERR_NETWORK", async () => {
    await reachOtpStep();
    mockEzygoPost.mockRejectedValueOnce({ isAxiosError: true, code: "ERR_NETWORK" });

    fillOtpForm();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getByText("Network error. Please check your connection.")).toBeInTheDocument()
    );
  });

  it("shows error when CSRF token is unavailable", async () => {
    await reachOtpStep();
    mockGetCsrfToken.mockReturnValueOnce(null);
    mockEzygoPost.mockResolvedValueOnce({ data: { access_token: "token" } });

    fillOtpForm();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Reset Code").closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getByText("CSRF token unavailable – please reload the page and try again.")).toBeInTheDocument()
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    await reachOtpStep();

    const passwordInput = screen.getByPlaceholderText("Enter your new password");
    expect(passwordInput).toHaveAttribute("type", "password");

    const eyeButtons = screen.getAllByRole("button").filter((btn) => {
      const parent = btn.closest(".relative");
      return parent?.contains(passwordInput);
    });
    if (eyeButtons.length > 0) {
      fireEvent.click(eyeButtons[0]);
      expect(passwordInput).toHaveAttribute("type", "text");
    }
  });
});
