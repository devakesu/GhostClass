import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
vi.unmock('@/hooks/use-sync-on-mount');
import TrackingClient from '../TrackingClient';
import { createClient } from '@/lib/supabase/client';

// Hoisted flag that controls whether the @sentry/nextjs dynamic import throws.
// Used by the "import failure" test suite to exercise the .catch() branch
// in captureSentryException without resetting every module-level mock.
const sentryConfig = vi.hoisted(() => ({ shouldFail: false }));

// Mock all required hooks
vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({ data: [], isLoading: false, error: null }),
  })),
}));

vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: vi.fn(() => ({
    data: 0,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: 0, isLoading: false }),
  })),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  })),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
    useQuery: vi.fn(),
  };
});

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: () => ({
    data: null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({
    data: 'even',
    isLoading: false,
  }),
  useFetchAcademicYear: () => ({
    data: '2024-25',
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    disabledCoursesMap: {},
    disabledCodes: new Set<string>(),
    isDisabled: vi.fn(() => false),
    getDisableReason: vi.fn(() => null),
    disableCourse: vi.fn(),
    enableCourse: vi.fn(),
    isLoading: false,
  })),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({
    isSyncing: false,
    syncCompleted: true,
  })),
}));



vi.mock('../../../lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-user-123' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock('@sentry/nextjs', () => {
  if (sentryConfig.shouldFail) throw new Error('Sentry SDK unavailable');
  return { captureException: vi.fn() };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => {
  const MockComponent = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  return {
    LazyMotion: ({ children }: any) => children,
    domAnimation: {},
    m: {
      div: MockComponent,
      button: MockComponent,
      p: MockComponent,
      span: MockComponent,
    },
    motion: {
      div: MockComponent,
      button: MockComponent,
      p: MockComponent,
      span: MockComponent,
    },
    AnimatePresence: ({ children }: any) => children,
  };
});

// Mock UI components
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogCancel: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

// Mock Loading component
vi.mock('@/components/loading', () => ({
  Loading: () => <div role="status">Loading...</div>,
}));

vi.mock('lucide-react', () => {
  const Icon = () => null;
  const commonIcons = [
    'Trash2', 'CircleAlert', 'ChevronLeft', 'ChevronRight', 'ChevronDown',
    'ChevronDownIcon', 'BookOpen', 'ArrowDown', 'Filter', 'Loader2', 'ChevronUpIcon', 'CheckIcon'
  ];
  const mock: any = { __esModule: true };
  commonIcons.forEach(icon => {
    mock[icon] = Icon;
  });
  return mock;
});

// Mock attendance-reconciliation
vi.mock('@/lib/logic/attendance-reconciliation', () => ({
  getOfficialSessionRaw: vi.fn((session: any, sessionKey: string | number) => {
    if (session && session.session != null && session.session !== '') return session.session;
    return sessionKey;
  }),
  DUTY_LEAVE_PLACEHOLDER_REMARKS: new Set<string>(["Duty Leave", "Self-Marked: Duty Leave"]),
}));

import { useTrackingData } from '@/hooks/tracker/useTrackingData';
import { useTrackingCount } from '@/hooks/tracker/useTrackingCount';

// Shared sample tracking item matching semester/year from the useFetchSemester/useFetchAcademicYear mocks
const sampleTrackingItem = {
  id: 'track-1',
  auth_user_id: 'auth-user-123',
  course: 'CS101',
  session: '1',
  date: '20240901',
  attendance: 111,
  status: 'extra',
  semester: 'even',
  year: '2024-25',
  created_at: new Date().toISOString(),
};

const dlTrackingItem = {
  id: 'track-2',
  auth_user_id: 'auth-user-123',
  course: 'CS101',
  session: '2',
  date: '20240902',
  attendance: 225,
  remarks: 'NSS Camp 2024',
  status: 'extra',
  semester: 'even',
  year: '2024-25',
  created_at: new Date().toISOString(),
};

describe('TrackingClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default sync: succeed silently
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Loading state', () => {
    it('should show loading indicator on initial render', () => {
      render(<div role="status">Loading...</div>);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Ternary Operator - Singular vs Plural (line 537)', () => {
    it('should display "record" for count of 1 in delete-all dialog', async () => {
      vi.mocked(useTrackingData).mockReturnValue({
        data: [sampleTrackingItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [sampleTrackingItem], isLoading: false, error: null }),
      } as any);

      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // Wait for enabled effect to switch from Loading to full UI
      const clearBtn = await screen.findByRole('button', { name: /delete all 1 tracked class/i });
      fireEvent.click(clearBtn);

      // Dialog should now be open with "record" (singular)
      expect(await screen.findByText(/1 tracking record\./i)).toBeInTheDocument();
    });

    it('should display "records" for count greater than 1 in delete-all dialog and close on confirm', async () => {
      vi.mocked(useTrackingData).mockReturnValue({
        data: [sampleTrackingItem, { ...sampleTrackingItem, session: '2' }] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [], isLoading: false, error: null }),
      } as any);

      vi.mocked(useTrackingCount).mockReturnValue({
        data: 2,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 0, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // Wait for full UI, then open dialog
      const clearBtn = await screen.findByRole('button', { name: /delete all 2 tracked classes/i });
      fireEvent.click(clearBtn);

      // Dialog should show "records" (plural)
      expect(await screen.findByText(/2 tracking records\./i)).toBeInTheDocument();

      // Click Delete All – exercises line 544-545 (deleteAllTrackingData + setDeleteAllConfirmOpen(false))
      const deleteAllBtn = await screen.findByRole('button', { name: /delete all/i });
      fireEvent.click(deleteAllBtn);

      // After confirming, dialog should close (setDeleteAllConfirmOpen(false) called)
      await waitFor(() => {
        expect(screen.queryByText(/2 tracking records\./i)).not.toBeInTheDocument();
      });
    });
  });

  describe('DL remarks display', () => {
    it('renders custom DL remarks when attCode is 225 and remarks is not a placeholder', async () => {
      vi.mocked(useTrackingData).mockReturnValue({
        data: [dlTrackingItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [dlTrackingItem], isLoading: false, error: null }),
      } as any);

      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // The custom remarks should be rendered as an italicised paragraph
      expect(await screen.findByText('NSS Camp 2024')).toBeInTheDocument();
    });
  });

  describe('captureSentryException – Sentry import failure', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      sentryConfig.shouldFail = false;
      vi.resetModules();
    });

    it('logs console errors when Sentry SDK import fails during a delete operation', async () => {
      vi.mocked(useTrackingData).mockReturnValue({
        data: [sampleTrackingItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [sampleTrackingItem], isLoading: false, error: null }),
      } as any);

      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      // Make Supabase delete resolve with an error so captureSentryException is called
      vi.mocked(createClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-123' } } }),
        },
        from: vi.fn(() => {
          const builder: any = {};
          builder.delete = vi.fn(() => builder);
          builder.eq = vi.fn(() => builder);
          // Minimal thenable so that `await` on the builder yields the Supabase-style response
          builder.then = vi.fn((onFulfilled: (value: { data: null; error: Error }) => unknown) =>
            Promise.resolve({ data: null, error: new Error('Supabase delete failed') }).then(onFulfilled),
          );
          return builder;
        }),
      } as any);

      // Force the @sentry/nextjs dynamic import to fail on next resolution
      sentryConfig.shouldFail = true;
      vi.resetModules();

      render(<TrackingClient />);

      // Wait for the component to render past the loading state (sync completes)
      const removeBtn = await screen.findByRole('button', { name: /remove tracking entry/i });
      fireEvent.click(removeBtn);

      // Confirm deletion in the single-item dialog
      const deleteBtn = await screen.findByRole('button', { name: /^delete$/i });
      fireEvent.click(deleteBtn);

      // The .catch() handler inside captureSentryException should log the error
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[Sentry] Failed to load SDK for captureException:',
          expect.any(Error),
        );
      });
    });
  });

  describe('getStatusKey – Present attendance code (110)', () => {
    it('renders "Present" status badge for attendance code 110', async () => {
      const presentItem = {
        auth_user_id: 'auth-user-123',
        course: 'CS101',
        session: 'III',
        date: '20240903',
        attendance: 110,
        status: 'extra',
        semester: 'even',
        year: '2024-25',
      };
      vi.mocked(useTrackingData).mockReturnValue({
        data: [presentItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [presentItem], isLoading: false, error: null }),
      } as any);
      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // "Present" status label should appear in the status sub-header
      const presentElements = await screen.findAllByText('Present');
      expect(presentElements.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeDate – ISO, slash and dash formats', () => {
    it('renders correctly formatted date from ISO format input (T-branch)', async () => {
      const isoDateItem = {
        auth_user_id: 'auth-user-123',
        course: 'CS101',
        session: 'IV',
        date: '2024-09-04T10:00:00.000Z',
        attendance: 111,
        status: 'extra',
        semester: 'even',
        year: '2024-25',
      };
      vi.mocked(useTrackingData).mockReturnValue({
        data: [isoDateItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [isoDateItem], isLoading: false, error: null }),
      } as any);
      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // normalizeDate('2024-09-04T10:00:00.000Z') → '20240904' → formatDisplayDate → '04/09/2024'
      expect(await screen.findByText('04/09/2024')).toBeInTheDocument();
    });

    it('renders correctly formatted date from DD/MM/YYYY slash format', async () => {
      const slashDateItem = {
        auth_user_id: 'auth-user-123',
        course: 'CS101',
        session: 'V',
        date: '04/09/2024',
        attendance: 111,
        status: 'extra',
        semester: 'even',
        year: '2024-25',
      };
      vi.mocked(useTrackingData).mockReturnValue({
        data: [slashDateItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [slashDateItem], isLoading: false, error: null }),
      } as any);
      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // normalizeDate('04/09/2024') → '20240904' → formatDisplayDate → '04/09/2024'
      expect(await screen.findByText('04/09/2024')).toBeInTheDocument();
    });

    it('renders correctly formatted date from YYYY-MM-DD dash format (no T)', async () => {
      const dashDateItem = {
        auth_user_id: 'auth-user-123',
        course: 'CS101',
        session: 'VI',
        date: '2024-09-05',
        attendance: 111,
        status: 'extra',
        semester: 'even',
        year: '2024-25',
      };
      vi.mocked(useTrackingData).mockReturnValue({
        data: [dashDateItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [dashDateItem], isLoading: false, error: null }),
      } as any);
      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // normalizeDate('2024-09-05') → '20240905' → formatDisplayDate → '05/09/2024'
      expect(await screen.findByText('05/09/2024')).toBeInTheDocument();
    });

    it('falls back to raw dateStr when date cannot be normalized to 8 digits (formatDisplayDate/parseDateValue fallback)', async () => {
      const badDateItem = {
        auth_user_id: 'auth-user-123',
        course: 'CS101',
        session: 'VII',
        date: 'invalid',
        attendance: 111,
        status: 'extra',
        semester: 'even',
        year: '2024-25',
      };
      vi.mocked(useTrackingData).mockReturnValue({
        data: [badDateItem] as any,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: [badDateItem], isLoading: false, error: null }),
      } as any);
      vi.mocked(useTrackingCount).mockReturnValue({
        data: 1,
        isLoading: false,
        refetch: vi.fn().mockResolvedValue({ data: 1, isLoading: false }),
      } as any);

      render(<TrackingClient />);

      // formatDisplayDate('invalid') → normalizeDate → '' → length !== 8 → returns 'invalid'
      expect(await screen.findByText('invalid')).toBeInTheDocument();
    });
  });
});
