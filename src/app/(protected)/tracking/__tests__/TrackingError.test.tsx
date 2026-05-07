import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TrackingError from '../error';
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
  ErrorFallback: ({ error, reset }: any) => (
    <div data-testid="error-fallback">
      <span>{error.message}</span>
      <button onClick={reset}>Reset</button>
    </div>
  ),
}));

describe('TrackingError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and captures exception on mount', () => {
    const error = new Error('Test error') as any;
    error.digest = 'test-digest';
    const reset = vi.fn();

    render(<TrackingError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[tracking] Render error:", "Test error", "test-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "tracking",
        digest: "test-digest",
      },
    });
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });
});
