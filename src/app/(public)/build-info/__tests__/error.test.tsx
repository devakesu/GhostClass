import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BuildInfoError from "../error";
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
  ErrorFallback: ({ error, reset, homeUrl }: any) => (
    <div data-testid="error-fallback">
      <span>{error.message}</span>
      <button onClick={reset}>Reset</button>
      <a href={homeUrl}>Home</a>
    </div>
  ),
}));

describe("BuildInfoError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs error and captures exception", () => {
    const error = new Error("Test build-info error") as any;
    error.digest = "test-digest";
    const reset = vi.fn();

    render(<BuildInfoError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[build-info] Render error:"),
      "Test build-info error",
      "test-digest",
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { location: "build-info", digest: "test-digest" },
    });
  });
});
