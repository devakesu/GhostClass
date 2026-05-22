/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedLayout from '../layout';

// Mock all the things
vi.mock('@/hooks/users/institutions', () => ({
  useInstitutions: vi.fn(),
}));

vi.mock('@/hooks/use-csrf-token', () => ({
  useCSRFToken: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children and navbar/footer', () => {
    render(
      <ProtectedLayout>
        <div data-testid="child">Protected Content</div>
      </ProtectedLayout>
    );

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
