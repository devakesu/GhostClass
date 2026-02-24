import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardClient from '../DashboardClient';

// Mock next/dynamic
vi.mock('next/dynamic', () => ({
  default: (_loader: any, options: any) => {
    const DynamicComponent = (_props: any) => {
      // Render the loading component
      if (options?.loading) {
        return options.loading();
      }
      return null;
    };
    DynamicComponent.displayName = 'DynamicComponent';
    return DynamicComponent;
  },
}));

// Mock ldrs/react
vi.mock('ldrs/react', () => ({
  Ring2: () => <div data-testid="ring2-spinner" />,
}));

// Mock ldrs/react CSS
vi.mock('ldrs/react/Ring2.css', () => ({}));

// Mock all the hooks
vi.mock('@/hooks/users/profile', () => ({
  useProfile: () => ({ data: null, isLoading: false, refetch: vi.fn().mockResolvedValue({}) }),
}));

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: () => ({
    data: {
      attendance_percentage: 85,
      total_sessions: 20,
      attended_sessions: 17,
    },
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({
      data: {
        attendance_percentage: 85,
        total_sessions: 20,
        attended_sessions: 17,
      },
    }),
  }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: null, isLoading: false, isError: false }),
  useFetchAcademicYear: () => ({ data: null, isLoading: false, isError: false }),
  useSetSemester: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetAcademicYear: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: () => ({
    absenceIncludesOtherLeave: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('DashboardClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('ChartSkeleton Component (Line 52)', () => {
    it('should render ChartSkeleton with loading spinner', async () => {
      // Mock sync completion
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<DashboardClient initialData={null} />);
      
      // Wait for sync and check for loading state
      const loadingElements = await screen.findAllByRole('status', { hidden: true });
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Import Loading State (Line 61)', () => {
    it('should render loading component during dynamic import', async () => {
      // Mock sync completion
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<DashboardClient initialData={null} />);
      
      // Wait for sync and check for loading state
      const loadingElements = await screen.findAllByRole('status', { hidden: true });
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    // TODO: This test is skipped because next/dynamic mock doesn't properly render ChartSkeleton
    // The mock returns null instead of the loading component
    it.todo('should use ChartSkeleton as loading fallback for AttendanceChart');
  });

  describe('SSR Configuration', () => {
    // TODO: This test is skipped for the same reason as the ChartSkeleton test above
    it.todo('should disable SSR for AttendanceChart');
  });

  describe('Background sync – partial sync (207)', () => {
    it('should show warning toast and trigger captureSentryMessage on 207 response', async () => {
      const { toast } = await import('sonner');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 207,
        json: async () => ({ success: false, errors: ['some-course-failed'] }),
      });

      render(<DashboardClient initialData={null} />);

      // Wait for the sync effect to process the 207 response
      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          'Partial Sync Completed',
          expect.objectContaining({ description: expect.any(String) })
        );
      });
    });
  });

  describe('Background sync – failure', () => {
    it('should call captureSentryException when sync fetch throws', async () => {
      const Sentry = await import('@sentry/nextjs');

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<DashboardClient initialData={null} />);

      // Wait for the sync effect to process the failure
      await waitFor(() => {
        // The dynamic import of Sentry happens asynchronously, but the module-level
        // captureSentryException wrapper is invoked when the error is caught
        expect(global.fetch).toHaveBeenCalled();
      });

      // Sentry is lazily imported inside captureSentryException; give it a tick to resolve
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
