import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ServiceErrorView } from '../service-error-view';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

describe('ServiceErrorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default props', () => {
    render(<ServiceErrorView />);
    expect(screen.getByText('Connection Error')).toBeDefined();
    expect(screen.getByText(/Ezygo API is not responding properly/)).toBeDefined();
  });

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ServiceErrorView onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('navigates to home when Home button is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as any);
    render(<ServiceErrorView showHome={true} />);
    fireEvent.click(screen.getByText('Home'));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('navigates to contact page when Contact Us is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as any);
    render(<ServiceErrorView error="Test Error" />);
    fireEvent.click(screen.getByText('Contact Us'));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/contact?subject=Connection%20Error'));
  });

  it('handles logout correctly', async () => {
    const push = vi.fn();
    const refresh = vi.fn();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(useRouter).mockReturnValue({ push, refresh } as any);
    vi.mocked(createBrowserClient).mockReturnValue({ auth: { signOut } } as any);

    render(<ServiceErrorView />);
    fireEvent.click(screen.getByText('Logout & try again'));

    await vi.waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/');
      expect(refresh).toHaveBeenCalled();
    });
  });
});
