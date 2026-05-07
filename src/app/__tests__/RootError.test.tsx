/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RootError from '../error';
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

vi.mock("@/components/layout/public-navbar", () => ({
  PublicNavbar: () => <div data-testid="public-navbar">Navbar</div>,
}));

vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

describe('RootError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error components and logs error', () => {
    const error = new Error('Global error') as any;
    error.digest = 'global-digest';
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith("[root] Render error:", "Global error", "global-digest");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        location: "error.tsx",
        digest: "global-digest",
      },
    });
    expect(screen.getByTestId('public-navbar')).toBeInTheDocument();
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });
});
