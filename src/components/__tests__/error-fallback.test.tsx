import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorFallback } from '../error-fallback';
import { useRouter } from 'next/navigation';
import { handleLogout } from '@/lib/security/auth';
import { createClient } from '@/lib/supabase/client';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn(),
  isAuthSessionMissingError: vi.fn(() => false),
}));

vi.mock('@/lib/sw-reload', () => ({
  reloadWithUpdate: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('ErrorFallback Component', () => {
  const mockPush = vi.fn();
  const mockError = new Error('Test error');
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: mockPush,
    });
    (createClient as any).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });
  });

  it('renders correctly', () => {
    render(<ErrorFallback error={mockError} />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Try Again')).toBeDefined();
    expect(screen.getByText('Go Home')).toBeDefined();
  });

  it('calls reset when Try Again is clicked and reset is provided', () => {
    render(<ErrorFallback error={mockError} reset={mockReset} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(mockReset).toHaveBeenCalled();
  });

  it('navigates home when Go Home is clicked', () => {
    render(<ErrorFallback error={mockError} />);
    fireEvent.click(screen.getByText('Go Home'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows error details in development', () => {
    // Save original NODE_ENV
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    render(<ErrorFallback error={mockError} />);
    expect(screen.getByText('Error Details (Dev Only)')).toBeDefined();
    expect(screen.getByText((content) => content.includes('Test error'))).toBeDefined();
    
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
  });

  it('handles logout when logged in', async () => {
    (createClient as any).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: '123' } }, error: null }),
      },
    });

    render(<ErrorFallback error={mockError} />);
    
    // Wait for auth check
    const logoutButton = await screen.findByText('Logout');
    expect(logoutButton).toBeDefined();
    
    fireEvent.click(logoutButton);
    expect(handleLogout).toHaveBeenCalled();
  });
});
