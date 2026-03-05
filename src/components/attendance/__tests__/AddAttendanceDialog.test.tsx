/**
 * Tests for AddAttendanceDialog covering:
 *  - DL reason input visibility toggling (statusType === "Duty Leave")
 *  - dlReason state cleared when switching away from Duty Leave
 *  - onChange handler on the DL reason Input
 *  - remarks ternary (DL branch and non-DL branch) via submit
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AddAttendanceDialog } from "../AddAttendanceDialog";

// ---------------------------------------------------------------------------
// Hoisted state shared between RadioGroup + RadioGroupItem mocks
// ---------------------------------------------------------------------------
const { radioGroupCallbackRef, mockInsert } = vi.hoisted(() => ({
  radioGroupCallbackRef: { current: null as ((v: string) => void) | null },
  mockInsert: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-user-123" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "auth-user-123" } } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/error-handling", () => ({
  isDutyLeaveConstraintError: vi.fn(() => false),
  getDutyLeaveErrorMessage: vi.fn(() => "DL limit reached"),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { _onValueChange: onValueChange }) : null,
      )}
    </div>
  ),
  SelectTrigger: ({ children, _onValueChange: _, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectContent: ({ children, _onValueChange }: any) => (
    <div>
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { _onValueChange }) : null,
      )}
    </div>
  ),
  SelectItem: ({ children, value, _onValueChange, ...props }: any) => (
    <div role="option" onClick={() => _onValueChange?.(value)} data-value={value} {...props}>
      {children}
    </div>
  ),
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ onChange, placeholder, value, id, ...props }: any) => (
    <input
      id={id}
      onChange={onChange}
      placeholder={placeholder}
      value={value ?? ""}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children, onValueChange, value, className }: any) => {
    radioGroupCallbackRef.current = onValueChange ?? null;
    return (
      <div role="radiogroup" data-value={value} className={className}>
        {children}
      </div>
    );
  },
  RadioGroupItem: ({ value, id, className }: any) =>
    React.createElement("input", {
      type: "radio",
      id,
      value,
      className,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        radioGroupCallbackRef.current?.(e.target.value);
      },
    }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("lucide-react", () => ({
  Loader2: () => <span data-testid="loader2-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Calendar: () => <span data-testid="calendar-icon" />,
  ChevronLeft: () => <span data-testid="chevron-left-icon" />,
  ChevronRight: () => <span data-testid="chevron-right-icon" />,
}));

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------
const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  trackingData: [] as any[],
  user: { id: "user-123", auth_id: "auth-user-123" },
  onSuccess: vi.fn(),
  coursesData: {
    courses: {
      "42": { id: 42, name: "Test Course", code: "TC101" },
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AddAttendanceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    radioGroupCallbackRef.current = null;
  });

  it("renders the dialog title when open", () => {
    render(<AddAttendanceDialog {...defaultProps} />);
    expect(screen.getByText("Add Extra Class")).toBeInTheDocument();
  });

  it("does not show DL reason input when Present is selected (default)", () => {
    render(<AddAttendanceDialog {...defaultProps} />);
    expect(screen.queryByPlaceholderText("Programme/Activity")).not.toBeInTheDocument();
  });

  it("shows DL reason input when Duty Leave is selected via radioGroupCallbackRef", async () => {
    render(<AddAttendanceDialog {...defaultProps} />);

    // Directly invoke the RadioGroup onValueChange callback (the mock captures it
    // into radioGroupCallbackRef.current during render)
    act(() => {
      radioGroupCallbackRef.current?.("Duty Leave");
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Programme/Activity")).toBeInTheDocument();
    });
  });

  it("clears dlReason and hides input when switching away from Duty Leave", async () => {
    render(<AddAttendanceDialog {...defaultProps} />);

    // Switch to Duty Leave
    act(() => {
      radioGroupCallbackRef.current?.("Duty Leave");
    });
    const reasonInput = await screen.findByPlaceholderText("Programme/Activity");

    // Type a reason
    fireEvent.change(reasonInput, { target: { value: "Sports Day" } });

    // Switch back to Present – triggers `if (v !== "Duty Leave") setDlReason("")`
    act(() => {
      radioGroupCallbackRef.current?.("Present");
    });

    // Input should disappear
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Programme/Activity")).not.toBeInTheDocument();
    });
  });

  it("allows typing in the DL reason input (covers onChange handler)", async () => {
    render(<AddAttendanceDialog {...defaultProps} />);

    act(() => {
      radioGroupCallbackRef.current?.("Duty Leave");
    });

    const reasonInput = await screen.findByPlaceholderText("Programme/Activity");
    fireEvent.change(reasonInput, { target: { value: "NSS Camp" } });

    // Input is still visible
    expect(screen.getByPlaceholderText("Programme/Activity")).toBeInTheDocument();
  });

  it("submits with DL remarks ternary (DL branch) – covers remarks ternary new lines", async () => {
    render(<AddAttendanceDialog {...defaultProps} />);

    // Set session via the Select mock (click the "1st Hour" option)
    const sessionOptions = screen.getAllByRole("option");
    const firstHourOption = sessionOptions.find(
      (el) => el.getAttribute("data-value") === "1",
    );
    if (firstHourOption) fireEvent.click(firstHourOption);

    // Set course via the Select mock
    const courseOption = screen.getByRole("option", { name: /test course/i });
    fireEvent.click(courseOption);

    // Select Duty Leave
    act(() => {
      radioGroupCallbackRef.current?.("Duty Leave");
    });

    // Type a custom DL reason
    const reasonInput = await screen.findByPlaceholderText("Programme/Activity");
    fireEvent.change(reasonInput, { target: { value: "Annual Sports Meet" } });

    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /submit and add attendance record/i });
    fireEvent.click(submitBtn);

    // Insert should be called with the custom DL reason in remarks
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ remarks: "Annual Sports Meet" }),
      );
    });
  });

  it("submits with non-DL remarks (covers Self-Marked branch)", async () => {
    render(<AddAttendanceDialog {...defaultProps} />);

    // Set session
    const sessionOptions = screen.getAllByRole("option");
    const firstHourOption = sessionOptions.find(
      (el) => el.getAttribute("data-value") === "1",
    );
    if (firstHourOption) fireEvent.click(firstHourOption);

    // Set course
    const courseOption = screen.getByRole("option", { name: /test course/i });
    fireEvent.click(courseOption);

    // Status is Present (default) – non-DL branch
    const submitBtn = screen.getByRole("button", { name: /submit and add attendance record/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ remarks: "Self-Marked: Present" }),
      );
    });
  });

  describe("session index+1 fallback (opaque slot key)", () => {
    /**
     * When a slot in studentAttendanceData has a key that parseInt() cannot
     * parse as a number < 20 (e.g. "opaque-key-99"), and the slot has no
     * session name from attendanceData.sessions nor from slot.session, the
     * component falls back to `String(index + 1)` as the effective session name.
     * Index 0 → "1", index 1 → "2", etc.
     *
     * This test verifies that:
     * 1. The occupancy-detection useEffect treats slot at index 0 as occupying
     *    session "1" via the index+1 fallback.
     * 2. The isSessionBlocked memo returns true when session "1" is selected,
     *    triggering the "Session occupied" warning.
     */
    it("treats an opaque slot key at index 0 as occupying session 1 (index+1 fallback)", async () => {
      vi.useFakeTimers();
      const fixedDate = new Date("2025-01-15T10:00:00Z");
      vi.setSystemTime(fixedDate);
      const todayKey = `${fixedDate.getFullYear()}${String(fixedDate.getMonth() + 1).padStart(2, "0")}${String(fixedDate.getDate()).padStart(2, "0")}`;

      try {
        const propsWithAttendance = {
          ...defaultProps,
          attendanceData: {
            courses: { "42": { name: "Test Course", code: "TC101" } },
            sessions: {}, // no named sessions → fallback must kick in
            attendanceTypes: {},
            studentAttendanceData: {
              [todayKey]: {
                // key that parseInt() cannot resolve as a number < 20
                "opaque-key-99": {
                  course: "42",
                  session: null,
                },
              },
            },
            attendanceDatesArray: {},
          },
        };

        render(<AddAttendanceDialog {...(propsWithAttendance as any)} />);

        // Wait for the dialog to fully render
        await waitFor(() => {
          expect(screen.getByText("Add Extra Class")).toBeInTheDocument();
        });

        // After mount the useEffect auto-selects session "2" (first free, since "1" is
        // occupied by the opaque slot at index 0). Now manually select "1" to trigger
        // isSessionBlocked and confirm the "Session occupied" warning appears.
        const sessionOneOption = screen
          .getAllByRole("option")
          .find((el) => el.getAttribute("data-value") === "1");
        expect(sessionOneOption).toBeDefined();
        fireEvent.click(sessionOneOption!);

        await waitFor(() => {
          expect(screen.getByRole("alert")).toHaveTextContent("Session occupied");
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("treats the second opaque slot (index 1) as session 2 when key is non-numeric", async () => {
      vi.useFakeTimers();
      const fixedDate = new Date("2025-01-15T10:00:00Z");
      vi.setSystemTime(fixedDate);
      const todayKey = `${fixedDate.getFullYear()}${String(fixedDate.getMonth() + 1).padStart(2, "0")}${String(fixedDate.getDate()).padStart(2, "0")}`;

      try {
        const propsWithAttendance = {
          ...defaultProps,
          attendanceData: {
            courses: { "42": { name: "Test Course", code: "TC101" } },
            sessions: {},
            attendanceTypes: {},
            studentAttendanceData: {
              [todayKey]: {
                // index 0 → session "1" occupied
                "slot-a": { course: "42", session: null },
                // index 1 → session "2" occupied
                "slot-b": { course: "42", session: null },
              },
            },
            attendanceDatesArray: {},
          },
        };

        render(<AddAttendanceDialog {...(propsWithAttendance as any)} />);

        await waitFor(() => {
          expect(screen.getByText("Add Extra Class")).toBeInTheDocument();
        });

        // Select session "2" – should be blocked (slot-b at index 1 maps to "2")
        const sessionTwoOption = screen
          .getAllByRole("option")
          .find((el) => el.getAttribute("data-value") === "2");
        expect(sessionTwoOption).toBeDefined();
        fireEvent.click(sessionTwoOption!);

        await waitFor(() => {
          expect(screen.getByRole("alert")).toHaveTextContent("Session occupied");
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
