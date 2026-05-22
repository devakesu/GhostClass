/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import ProtectedLayout from '../layout';
import { useScroll } from 'framer-motion';

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

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MotionDiv = React.forwardRef(({ children, animate, ...props }: any, ref: any) => (
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
});
