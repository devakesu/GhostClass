import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import GlobalError from '../global-error';
import * as Sentry from '@sentry/nextjs';
import { reloadWithUpdate, tryAutoUpdate } from '@/lib/sw-reload';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/sw-reload', () => ({
  reloadWithUpdate: vi.fn(),
  tryAutoUpdate: vi.fn(),
}));

describe('GlobalError', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    delete window.location;
    window.location = { ...originalLocation, href: '' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('reports error to Sentry and tries auto update on mount', () => {
    const error = new Error('Global Crash') as any;
    error.digest = 'global-digest';
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
      tags: expect.objectContaining({ digest: 'global-digest' }),
    }));
    expect(tryAutoUpdate).toHaveBeenCalled();
  });

  it('calls reloadWithUpdate when Try Again is clicked', () => {
    const error = new Error('Global Crash');
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(reloadWithUpdate).toHaveBeenCalled();
  });

  it('navigates to home when Go Home is clicked', () => {
    const error = new Error('Global Crash');
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    fireEvent.click(screen.getByText('Go Home'));
    expect(window.location.href).toBe('/');
  });
});
