/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthError from '../error';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/components/error-fallback', () => ({
  ErrorFallback: ({ error, reset, homeUrl }: any) => (
    <div data-testid="error-fallback">
      <span>{error.message}</span>
      <button onClick={reset}>Reset</button>
      <span>{homeUrl}</span>
    </div>
  ),
}));

describe('AuthError', () => {
  const mockError = new Error('Test auth error') as Error & { digest?: string };
  mockError.digest = 'test-digest';
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and logs errors', () => {
    render(<AuthError error={mockError} reset={mockReset} />);

    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    expect(screen.getByText('Test auth error')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();

    expect(logger.error).toHaveBeenCalledWith(
      '[auth] Render error:',
      'Test auth error',
      'test-digest'
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(mockError, {
      tags: { location: 'auth', digest: 'test-digest' },
    });
  });

  it('handles reset call', () => {
    render(<AuthError error={mockError} reset={mockReset} />);
    
    fireEvent.click(screen.getByText('Reset'));
    expect(mockReset).toHaveBeenCalled();
  });
});
