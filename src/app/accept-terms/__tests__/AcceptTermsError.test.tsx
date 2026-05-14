/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AcceptTermsError from '../error';
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

describe('AcceptTermsError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and captures exception on mount', () => {
    const error = new Error('Terms error') as any;
    error.digest = 'terms-digest';
    const reset = vi.fn();

    render(<AcceptTermsError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[accept-terms] Render error:", "Terms error", "terms-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "accept-terms",
        digest: "terms-digest",
      },
    });
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
  });
});
