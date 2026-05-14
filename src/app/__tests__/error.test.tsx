import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorPage from '../error';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/components/layout/public-navbar', () => ({
  PublicNavbar: () => <nav>PublicNavbar</nav>,
}));

vi.mock('@/components/layout/footer', () => ({
  Footer: () => <footer>Footer</footer>,
}));

vi.mock('@/components/error-fallback', () => ({
  ErrorFallback: ({ error }: any) => <div data-testid="error-fallback">{error.message}</div>,
}));

describe('Global Error Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error and renders correctly', () => {
    const error = new Error('Test Error') as any;
    error.digest = 'test-digest';
    const reset = vi.fn();

    render(<ErrorPage error={error} reset={reset} />);

    expect(logger.error).toHaveBeenCalledWith(expect.any(String), 'Test Error', 'test-digest');
    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
      tags: expect.objectContaining({ digest: 'test-digest' }),
    }));
    expect(screen.getByTestId('error-fallback')).toBeDefined();
    expect(screen.getByText('Test Error')).toBeDefined();
  });
});
