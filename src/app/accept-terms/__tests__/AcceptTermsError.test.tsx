import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AcceptTermsError from '../error';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/components/error-fallback', () => ({
  ErrorFallback: ({ error }: any) => <div data-testid="error-fallback">{error.message}</div>,
}));

describe('AcceptTermsError', () => {
  it('renders ErrorFallback', () => {
    const error = new Error('Terms error');
    const reset = vi.fn();
    render(<AcceptTermsError error={error} reset={reset} />);
    expect(screen.getByTestId('error-fallback')).toHaveTextContent('Terms error');
  });
});
