/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProtectedLayout from '../layout';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { handleLogout } from '@/lib/security/auth';

// Mock all the things
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

vi.mock('@/hooks/users/institutions', () => ({
  useInstitutions: vi.fn(),
}));

vi.mock('@/hooks/use-csrf-token', () => ({
  useCSRFToken: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn(),
  isAuthSessionMissingError: vi.fn((err) => err.message === 'session missing'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useScroll: vi.fn(() => ({
      scrollY: {
        on: vi.fn(() => vi.fn()),
      },
    })),
  };
});

vi.mock('@/components/layout/private-navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));

vi.mock('@/components/layout/footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

vi.mock('@/components/toaster', () => ({
  Toaster: () => <div data-testid="toaster">Toaster</div>,
}));

vi.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

describe('ProtectedLayout', () => {
  const mockRouter = {
    replace: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
  });

  it('renders children and navbar/footer when authenticated', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: '123' } }, error: null }),
      },
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(
      <ProtectedLayout>
        <div data-testid="child">Protected Content</div>
      </ProtectedLayout>
    );

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockSupabase.auth.getUser).toHaveBeenCalled();
    });
  });

  it('calls handleLogout when user is missing', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(
      <ProtectedLayout>
        <div>Content</div>
      </ProtectedLayout>
    );

    await waitFor(() => {
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it('calls handleLogout when session missing error occurs', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('session missing') }),
      },
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(
      <ProtectedLayout>
        <div>Content</div>
      </ProtectedLayout>
    );

    await waitFor(() => {
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it('redirects to root when auth check fails completely', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error('Fatal auth error')),
      },
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(handleLogout).mockRejectedValue(new Error('Logout failed'));

    render(
      <ProtectedLayout>
        <div>Content</div>
      </ProtectedLayout>
    );

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
  });
});
