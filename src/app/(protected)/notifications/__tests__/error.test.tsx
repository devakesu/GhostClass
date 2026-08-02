import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import NotificationsError from "../error";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/components/error-fallback", () => ({
  ErrorFallback: vi.fn(({ error, reset }: any) => (
    <div data-testid="error-fallback">
      <span>{error.message}</span>
      <button onClick={reset}>Reset</button>
    </div>
  )),
}));

describe("NotificationsError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs error and captures exception", () => {
    const error = new Error("Test error") as any;
    error.digest = "test-digest";
    const reset = vi.fn();

    render(<NotificationsError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith(
      "[notifications] Render error:",
      "Test error",
      "test-digest",
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "notifications",
        digest: "test-digest",
      },
    });
    expect(ErrorFallback).toHaveBeenCalledWith(
      expect.objectContaining({ error, reset }),
      undefined,
    );
  });
});
