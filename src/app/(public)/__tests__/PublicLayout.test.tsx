/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import PublicLayout from '../layout';
import { useScroll } from 'framer-motion';

// Mock components
vi.mock("@/components/layout/public-navbar", () => ({
  PublicNavbar: () => <div data-testid="public-navbar">Navbar</div>,
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
  const MotionDiv = React.forwardRef(({ children, animate, _variants, _transition, ...props }: any, ref: any) => (
    <div 
      ref={ref} 
      data-testid="motion-div" 
      data-animate={animate} 
      data-is-inert={props.inert ? 'true' : 'false'}
      {...props}
    >
      {children}
    </div>
  ));
  MotionDiv.displayName = 'MotionDiv';
  return {
    motion: {
      div: MotionDiv,
    },
    useScroll: vi.fn(),
  };
});

describe('PublicLayout', () => {
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

  it('renders children and core components', () => {
    render(
      <PublicLayout>
        <div data-testid="child-content">Content</div>
      </PublicLayout>
    );

    expect(screen.getByTestId('public-navbar')).toBeDefined();
    expect(screen.getByTestId('footer')).toBeDefined();
    expect(screen.getByTestId('toaster')).toBeDefined();
    expect(screen.getByTestId('child-content')).toBeDefined();
  });

  it('handles scroll to hide/show navbar', async () => {
    render(
      <PublicLayout>
        <div>Content</div>
      </PublicLayout>
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
    
    // Scroll down but not enough
    act(() => {
        scrollCallback(120);
    });
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-animate')).toBe('visible');
    });
    
    // Scroll down enough again
    act(() => {
        scrollCallback(250);
    });
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-animate')).toBe('hidden');
    });
  });

  it('handles inert property when hidden', async () => {
    // Mock the prototype check to return true for "inert" in HTMLElement.prototype
    Object.defineProperty(HTMLElement.prototype, 'inert', {
      configurable: true,
      value: undefined, // Doesn't matter, just needs to exist in prototype
    });

    render(
      <PublicLayout>
        <div>Content</div>
      </PublicLayout>
    );

    // Hide it
    act(() => {
      scrollCallback(200);
    });
    
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-is-inert')).toBe('true');
    });
    
    // Show it
    act(() => {
      scrollCallback(100);
    });
    await waitFor(() => {
        expect(screen.getByTestId('motion-div').getAttribute('data-is-inert')).toBe('false');
    });

    // Clean up
    delete (HTMLElement.prototype as any).inert;
  });
});
