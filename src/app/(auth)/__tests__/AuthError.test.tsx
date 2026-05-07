/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthError from '../error';
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

describe('AuthError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and captures exception on mount', () => {
    const error = new Error('Auth error') as any;
    error.digest = 'auth-digest';
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[auth] Render error:", "Auth error", "auth-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "auth",
        digest: "auth-digest",
      },
    });
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
  });
});
