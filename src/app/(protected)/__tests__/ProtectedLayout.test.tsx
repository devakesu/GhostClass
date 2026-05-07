/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import ProtectedLayout from '../layout';
import { useScroll } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { handleLogout, isAuthSessionMissingError } from '@/lib/security/auth';
import { logger } from '@/lib/logger';
import * as Sentry from "@sentry/nextjs";

// Mock hooks
vi.mock("@/hooks/users/institutions", () => ({
  useInstitutions: vi.fn(),
}));
vi.mock("@/hooks/use-csrf-token", () => ({
  useCSRFToken: vi.fn(),
}));

// Mock components
vi.mock("@/components/layout/private-navbar", () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));
vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));
vi.mock("@/components/toaster", () => ({
  Toaster: () => <div data-testid="toaster">Toaster</div>,
}));
vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

// Mock Supabase
vi.mock('@/lib/supabase/client', () => {
  const mockUser = { id: '123' };
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null });
  const client = {
    auth: {
      getUser: mockGetUser,
    },
  };
  return {
    createClient: vi.fn(() => client),
  };
});

// Mock Auth logic
vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn().mockResolvedValue(undefined),
  isAuthSessionMissingError: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MotionDiv = React.forwardRef(({ children, animate, _variants, _transition, ...props }: any, ref: any) => (
    <div 
      ref={ref} 
      data-testid="motion-div" 
      data-animate={animate} 
      {...props}
    >
      {children}
    </div>
  ));
  MotionDiv.displayName = 'MotionDiv';
  return {
    LazyMotion: ({ children }: any) => children,
    domAnimation: {},
    m: { div: MotionDiv },
    useScroll: vi.fn(),
  };
});

describe('ProtectedLayout', () => {
  let scrollCallback: (latest: number) => void;
  const mockOn = vi.fn((event, callback) => {
    if (event === 'change') {
      scrollCallback = callback;
    }
    return () => {};
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
    vi.mocked(useScroll).mockReturnValue({
      scrollY: { on: mockOn } as any,
    } as any);

    const client = createClient();
    (client.auth.getUser as any).mockResolvedValue({ data: { user: { id: '123' } }, error: null });
  });

  it('renders children and essential components', async () => {
    render(
      <ProtectedLayout>
        <div data-testid="child">Child Content</div>
      </ProtectedLayout>
    );

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('handles scroll to hide/show navbar', async () => {
    render(
      <ProtectedLayout>
        <div>Content</div>
      </ProtectedLayout>
    );

    // Initial state: visible
    expect(screen.getByTestId('motion-div').getAttribute('data-animate')).toBe('visible');

    // Scroll down > 150
    act(() => {
      scrollCallback(200);
    });
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-animate')).toBe('hidden');
    });

    // Scroll up
    act(() => {
      scrollCallback(100);
    });
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-animate')).toBe('visible');
    });
  });

  it('handles auth session missing error', async () => {
    const client = createClient();
    const authError = { message: 'Session missing' };
    (client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: authError });
    vi.mocked(isAuthSessionMissingError).mockReturnValue(true);

    render(<ProtectedLayout><div>Content</div></ProtectedLayout>);

    await waitFor(() => {
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it('handles generic auth error and logs out', async () => {
    const client = createClient();
    const authError = new Error('Database down');
    (client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: authError });
    vi.mocked(isAuthSessionMissingError).mockReturnValue(false);

    render(<ProtectedLayout><div>Content</div></ProtectedLayout>);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith("Auth check failed:", "Database down");
      expect(Sentry.captureException).toHaveBeenCalledWith(authError, expect.any(Object));
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it('handles case where user is null but no error', async () => {
    const client = createClient();
    (client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null });

    render(<ProtectedLayout><div>Content</div></ProtectedLayout>);

    await waitFor(() => {
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it('redirects to root if logout fails after auth error', async () => {
    const client = createClient();
    const authError = new Error('Auth failed');
    (client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: authError });
    vi.mocked(handleLogout).mockRejectedValueOnce(new Error('Logout failed'));

    render(<ProtectedLayout><div>Content</div></ProtectedLayout>);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});
