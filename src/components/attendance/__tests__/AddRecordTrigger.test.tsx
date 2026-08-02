import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddRecordTrigger } from "../AddRecordTrigger";

// Mock the hooks
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/hooks/courses/attendance", () => ({
  useAttendanceReport: vi.fn(() => ({
    data: null,
    refetch: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("@/hooks/tracker/useTrackingData", () => ({
  useTrackingData: vi.fn(() => ({
    data: null,
    refetch: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("@/hooks/courses/courses", () => ({
  useFetchCourses: vi.fn(() => ({
    data: null,
  })),
}));

vi.mock("@/hooks/users/settings", () => ({
  useFetchAcademicYear: vi.fn(() => ({ data: "2023-24" })),
  useFetchSemester: vi.fn(() => ({ data: "even" })),
}));

// Mock the Dialog component to avoid rendering its complex interior
vi.mock("@/components/attendance/AddAttendanceDialog", () => ({
  AddAttendanceDialog: ({ open, onOpenChange, onSuccess }: any) => (
    open
      ? (
        <div data-testid="attendance-dialog">
          <button onClick={() => onSuccess()}>Simulate Success</button>
          <button onClick={() => onOpenChange(false)}>Close</button>
        </div>
      )
      : null
  ),
}));

describe("AddRecordTrigger", () => {
  const mockUser = {
    id: "123",
    auth_id: "auth-456",
    email: "test@example.com",
  };
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger button", () => {
    render(
      <AddRecordTrigger user={mockUser as any} onSuccess={mockOnSuccess} />,
    );
    expect(screen.getByRole("button", { name: /Add new record/i }))
      .toBeInTheDocument();
  });

  it("opens the dialog when clicked", () => {
    render(
      <AddRecordTrigger user={mockUser as any} onSuccess={mockOnSuccess} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add new record/i }));
    expect(screen.getByTestId("attendance-dialog")).toBeInTheDocument();
  });

  it("handles success correctly", async () => {
    const { useQueryClient } = await import("@tanstack/react-query");
    const invalidateQueries = vi.fn();
    (useQueryClient as any).mockReturnValue({ invalidateQueries });

    render(
      <AddRecordTrigger user={mockUser as any} onSuccess={mockOnSuccess} />,
    );

    // Open dialog
    fireEvent.click(screen.getByRole("button", { name: /Add new record/i }));

    // Trigger success
    fireEvent.click(screen.getByText("Simulate Success"));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["attendance-report"],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["attendance-report-all"],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["track_data"],
      });
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("handles user object without auth_id", () => {
    const userNoAuth = { id: "789" };
    render(
      <AddRecordTrigger user={userNoAuth as any} onSuccess={mockOnSuccess} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add new record/i }));
    expect(screen.getByTestId("attendance-dialog")).toBeInTheDocument();
  });
});
