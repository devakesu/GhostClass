import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpError from "../error";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/components/error-fallback", () => ({
  ErrorFallback: ({ error }: any) => (
    <div data-testid="error-fallback">{error.message}</div>
  ),
}));

describe("HelpError", () => {
  it("renders ErrorFallback", () => {
    const error = new Error("Help error");
    const reset = vi.fn();
    render(<HelpError error={error} reset={reset} />);
    expect(screen.getByTestId("error-fallback")).toHaveTextContent(
      "Help error",
    );
  });
});
