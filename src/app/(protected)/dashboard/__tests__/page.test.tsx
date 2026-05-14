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
vi.mock('../DashboardDataLoader', () => ({
  DashboardDataLoader: vi.fn().mockImplementation(({ token, userId }: any) => (
    <div data-testid="dashboard-client" data-has-data="true" data-token={token} data-userid={userId}>
      DashboardDataLoader Mock
    </div>
  )),
}));
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

      // Render the returned element
      render(element as unknown as ReactElement);
      
      // Since our mock is currently synchronous in this test environment, 
      // the loader renders immediately.
      expect(screen.getByTestId('dashboard-client')).toBeInTheDocument();
    });

  });
});

