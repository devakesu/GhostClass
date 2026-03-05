import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DashboardClient from '../DashboardClient';
import { useFetchSemester, useFetchAcademicYear } from '@/hooks/users/settings';

// Hoisted spies so they can be captured in vi.mock factory and used in assertions
const mockSetSemesterMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockSetAcademicYearMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

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
  useAllCourseDetails: () => ({
    data: undefined,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  useFetchAcademicYear: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  useSetSemester: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: mockSetSemesterMutateAsync, isPending: false })),
  useSetAcademicYear: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: mockSetAcademicYearMutateAsync, isPending: false })),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: () => ({
    isDisabled: () => false,
    getDisableReason: () => undefined,
    disableCourse: vi.fn(),
    enableCourse: vi.fn(),
    disabledCodes: new Set<string>(),
  }),
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

// Mock alert-dialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogAction: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogCancel: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

// Mock select (expose onValueChange via data-testid buttons for testing)
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select-root" data-value={value}>
      <button data-testid="select-trigger-even" onClick={() => onValueChange?.('even')}>even</button>
      <button data-testid="select-trigger-odd" onClick={() => onValueChange?.('odd')}>odd</button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
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
      }, { timeout: 10000 });
    }, 15000);
  });

  describe('Background sync – failure', () => {
    it('should call captureSentryException when sync fetch throws', async () => {
      // Async Sentry lazy-import + effect scheduling can take longer on a slow CI
      // machine. Set an explicit timeout so this test isn't flaky.
      const Sentry = await import('@sentry/nextjs');

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<DashboardClient initialData={null} />);

      // Wait for the sync effect to process the failure
      await waitFor(() => {
        // The dynamic import of Sentry happens asynchronously, but the module-level
        // captureSentryException wrapper is invoked when the error is caught
        expect(global.fetch).toHaveBeenCalled();
      }, { timeout: 10000 });

      // Sentry is lazily imported inside captureSentryException; give it a tick to resolve
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(Sentry.captureException).toHaveBeenCalled();
    }, 15000);
  });

  describe('Semester auto-initialization (Case B – null data)', () => {
    it('calls setSemesterMutation.mutateAsync when semesterData is null and no error', async () => {
      // Default mock already returns { data: null, isLoading: false, isError: false }
      // which triggers the Case B auto-init effect
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<DashboardClient initialData={null} />);

      await waitFor(() => {
        expect(mockSetSemesterMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ default_semester: expect.any(String) })
        );
      }, { timeout: 5000 });
    });
  });

  describe('Academic year auto-initialization (Case B – null data)', () => {
    it('calls setAcademicYearMutation.mutateAsync when academicYearData is null and no error', async () => {
      // Default mock returns { data: null, isLoading: false, isError: false }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<DashboardClient initialData={null} />);

      await waitFor(() => {
        expect(mockSetAcademicYearMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ default_academic_year: expect.any(String) })
        );
      }, { timeout: 5000 });
    });
  });

  describe('handleConfirmChange – confirm semester change dialog', () => {
    it('calls setSemesterMutation.mutateAsync and closes dialog on confirm', async () => {
      // Return existing semester 'even' so auto-init does NOT fire for semester
      vi.mocked(useFetchSemester).mockReturnValue({ data: 'even', isLoading: false, isError: false } as any);
      // Still null for year so we don't need to worry about it here (separate effect)
      vi.mocked(useFetchAcademicYear).mockReturnValue({ data: '2024-25', isLoading: false, isError: false } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<DashboardClient initialData={null} />);

      // Click the "odd" option on the first Select (semester Select, which appears at top)
      const oddTriggers = await screen.findAllByTestId('select-trigger-odd');
      fireEvent.click(oddTriggers[0]);

      // The AlertDialog should now be visible with a Confirm button
      const confirmBtn = await screen.findByRole('button', { name: /confirm/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockSetSemesterMutateAsync).toHaveBeenCalledWith({ default_semester: 'odd' });
      }, { timeout: 5000 });
    });
  });
});
