import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContactError from "../error";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

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

describe("ContactError", () => {
  const error = new Error("Test error") as Error & { digest?: string };
  error.digest = "test-digest";
  const reset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs error and captures exception on mount", () => {
    render(<ContactError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith(
      "[contact] Render error:",
      "Test error",
      "test-digest",
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({
          location: "contact",
          digest: "test-digest",
        }),
      }),
    );
    expect(screen.getByTestId("error-fallback")).toHaveTextContent(
      "Test error",
    );
  });
});
