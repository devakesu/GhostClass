/**
 * Tests for GlobalInit component.
 *
 * Covers:
 * - Removes #prehyd-loader element on mount
 * - Sets Sentry context when settings are available
 * - Does not crash when prehyd-loader is absent
 * - Returns null (renders nothing)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before imports)
// ---------------------------------------------------------------------------

const mockSetContext = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  setContext: mockSetContext,
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { dev: vi.fn(), error: vi.fn() },
}));

let mockSettings: Record<string, unknown> | null = null;

vi.mock('@/providers/user-settings', () => ({
  useUserSettings: () => ({ settings: mockSettings }),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { GlobalInit } from '../global-init';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlobalInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = null;
  });

  afterEach(() => {
    // Remove any leftover prehyd-loader elements
    document.getElementById('prehyd-loader')?.remove();
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<GlobalInit />);
    expect(container.firstChild).toBeNull();
  });

  it('removes the #prehyd-loader element on mount', () => {
    const div = document.createElement('div');
    div.id = 'prehyd-loader';
    document.body.appendChild(div);

    expect(document.getElementById('prehyd-loader')).not.toBeNull();

    act(() => {
      render(<GlobalInit />);
    });

    expect(document.getElementById('prehyd-loader')).toBeNull();
  });

  it('does not throw when #prehyd-loader is absent', () => {
    // Ensure the element doesn't exist
    document.getElementById('prehyd-loader')?.remove();

    expect(() => {
      act(() => {
        render(<GlobalInit />);
      });
    }).not.toThrow();
  });

  it('sets Sentry user_preferences context when settings is provided', () => {
    const settings = {
      bunk_calculator_enabled: true,
      target_percentage: 80,
      disabled_courses: {},
    };
    mockSettings = settings;

    act(() => {
      render(<GlobalInit />);
    });

    expect(mockSetContext).toHaveBeenCalledWith('user_preferences', { ...settings });
  });

  it('does not call Sentry setContext when settings is null', () => {
    mockSettings = null;

    act(() => {
      render(<GlobalInit />);
    });

    expect(mockSetContext).not.toHaveBeenCalled();
  });
});
