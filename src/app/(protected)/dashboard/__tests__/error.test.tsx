/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DashboardError from "../error";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/components/error-fallback", () => ({
  ErrorFallback: ({ error, reset }: any) => (
    <div data-testid="error-fallback">
      <span>{error.message}</span>
      <button onClick={reset}>Reset</button>
    </div>
  ),
}));

describe("DashboardError", () => {
  const mockError = new Error("Test dashboard error") as Error & {
    digest?: string;
  };
  mockError.digest = "dash-digest";
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly and logs errors", () => {
    render(<DashboardError error={mockError} reset={mockReset} />);

    expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    expect(screen.getByText("Test dashboard error")).toBeInTheDocument();

    expect(logger.error).toHaveBeenCalledWith(
      "[dashboard] Render error:",
      "Test dashboard error",
      "dash-digest",
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(mockError, {
      tags: { location: "dashboard", digest: "dash-digest" },
    });
  });

  it("handles reset call", () => {
    render(<DashboardError error={mockError} reset={mockReset} />);

    fireEvent.click(screen.getByText("Reset"));
    expect(mockReset).toHaveBeenCalled();
  });
});
