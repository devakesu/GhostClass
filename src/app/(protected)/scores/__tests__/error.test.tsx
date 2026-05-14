/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ScoresError from '../error';
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
  ErrorFallback: () => <div data-testid="error-fallback">ErrorFallback</div>,
}));

describe('ScoresError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and captures exception', () => {
    const error = new Error('Test error') as any;
    error.digest = 'test-digest';
    const reset = vi.fn();

    render(<ScoresError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[scores] Render error:", "Test error", "test-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "scores",
        digest: "test-digest",
      },
    });
  });
});
