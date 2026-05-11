import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('Service Unavailable')).toBeDefined();
    expect(screen.getByText(/EzyGo servers are currently down/)).toBeDefined();
  });

  it('calls onRetry when Try Again button is clicked', () => {
    const onRetry = vi.fn();
    render(<ServiceErrorView onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('navigates to home when Home button is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as any);
    render(<ServiceErrorView showHome={true} />);
    fireEvent.click(screen.getByText('Home'));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('navigates to contact page when Contact Support is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as any);
    render(<ServiceErrorView error="Test Error" />);
    // Mock window.location.href
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      configurable: true,
      writable: true,
    });
    
    fireEvent.click(screen.getByText('Contact Support'));
    expect(window.location.href).toContain('mailto:support@ghostclass.app?subject=Connection%20Error');
    
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it('handles logout correctly', async () => {
    const push = vi.fn();
    const refresh = vi.fn();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(useRouter).mockReturnValue({ push, refresh } as any);
    vi.mocked(createBrowserClient).mockReturnValue({ auth: { signOut } } as any);

    render(<ServiceErrorView />);
    fireEvent.click(screen.getByText('Sign Out'));

    await vi.waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/');
      expect(refresh).toHaveBeenCalled();
    });
  });
});
