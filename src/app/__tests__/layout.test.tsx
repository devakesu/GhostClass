import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from '../layout';

// Mock Next.js headers
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-nonce', 'test-nonce']])),
}));

// Mock providers and components
vi.mock('@/providers/react-query', () => ({
  default: ({ children }: any) => <div data-testid="react-query-provider">{children}</div>,
}));

vi.mock('@/providers/theme', () => ({
  ThemeProvider: ({ children }: any) => <div data-testid="theme-provider">{children}</div>,
}));

vi.mock('@/components/analytics-tracker', () => ({
  AnalyticsTracker: () => <div data-testid="analytics-tracker">AnalyticsTracker</div>,
}));

vi.mock('@/components/sw-register', () => ({
  ServiceWorkerRegister: () => <div data-testid="sw-register">ServiceWorkerRegister</div>,
}));

vi.mock('@/lib/global-init', () => ({
  GlobalInit: () => <div data-testid="global-init">GlobalInit</div>,
}));

vi.mock('nextjs-toploader', () => ({
  default: () => <div data-testid="toploader">TopLoader</div>,
}));

// Mock fonts to avoid loading issues in tests
vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: 'manrope' }),
  DM_Mono: () => ({ variable: 'dm-mono' }),
}));

vi.mock('next/font/local', () => ({
  default: () => ({ variable: 'klick' }),
}));

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with children and providers', async () => {
    // Since RootLayout is an async component, we need to call it as a function
    const Layout = await RootLayout({
      children: <div data-testid="content">Main Content</div>,
    });

    render(Layout);

    expect(screen.getByTestId('react-query-provider')).toBeDefined();
    expect(screen.getByTestId('theme-provider')).toBeDefined();
    expect(screen.getByTestId('content')).toBeDefined();
    expect(screen.getByTestId('sw-register')).toBeDefined();
    expect(screen.getByTestId('global-init')).toBeDefined();
  });

  it('handles missing nonce gracefully', async () => {
    const { headers } = await import('next/headers');
    vi.mocked(headers).mockResolvedValueOnce(new Map() as any);

    const Layout = await RootLayout({
      children: <div>Content</div>,
    });

    render(Layout);
    // If it didn't throw, it handled it (it defaults to undefined)
    expect(screen.getByText('Content')).toBeDefined();
  });
});
