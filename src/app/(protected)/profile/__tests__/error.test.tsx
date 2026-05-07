/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ProfileError from '../error';
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

describe('ProfileError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and captures exception', () => {
    const error = new Error('Test profile error') as any;
    error.digest = 'profile-digest';
    const reset = vi.fn();

    render(<ProfileError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[profile] Render error:", "Test profile error", "profile-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "profile",
        digest: "profile-digest",
      },
    });
  });
});
