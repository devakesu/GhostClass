import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

// Override the global next/navigation mock to include redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation(() => { throw new Error('NEXT_REDIRECT'); }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/ezygo-batch-fetcher', () => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('../DashboardClient', () => ({
  default: ({ initialData }: { initialData: unknown }) => (
    <div data-testid="dashboard-client" data-has-data={initialData ? 'true' : 'false'}>DashboardClient</div>
  ),
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div role="status">Loading...</div>,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import DashboardPage from '../page';
import { DashboardDataLoader } from '../DashboardDataLoader';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { fetchDashboardData } from '@/lib/ezygo-batch-fetcher';
import { redirect } from 'next/navigation';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication checks', () => {
    it('should redirect when auth error occurs', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error('Auth error'),
          }),
        },
      });

      await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    });

    it('should redirect when user is null', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      });

      await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    });

    it('should redirect when ezygo token is missing', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
      (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
      });

      await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('Successful render', () => {
    it('should render Suspense with DashboardDataLoader when authenticated', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
      (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: 'test-token-abc' }),
      });
      (fetchDashboardData as ReturnType<typeof vi.fn>).mockResolvedValue({
        courses: [],
        attendance: null,
      });

      const element = await DashboardPage();
      expect(element).not.toBeNull();

      // Render the returned element – Suspense fallback shows while DashboardDataLoader resolves
      render(element as ReactElement);
      expect(screen.getByRole('status')).toBeInTheDocument();

      // Call DashboardDataLoader directly – async RSC doesn't resolve in jsdom
      const loaderElement = await DashboardDataLoader({ token: 'test-token-abc', userId: 'user-123' });
      const { getByTestId } = render(loaderElement as ReactElement);
      expect(getByTestId('dashboard-client')).toBeInTheDocument();
    });

    it('should render DashboardClient with null initialData when fetchDashboardData fails', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
      });
      (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: 'bad-token' }),
      });
      (fetchDashboardData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('EzyGo unavailable')
      );

      const element = await DashboardPage();
      render(element as ReactElement);

      // Call DashboardDataLoader directly – async RSC doesn't resolve in jsdom
      const loaderElement = await DashboardDataLoader({ token: 'bad-token', userId: 'user-123' });
      const { getByTestId } = render(loaderElement as ReactElement);
      const client = getByTestId('dashboard-client');
      expect(client).toBeInTheDocument();
      expect(client.getAttribute('data-has-data')).toBe('false');
    });
  });
});
