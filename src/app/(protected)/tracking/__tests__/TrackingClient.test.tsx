import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    data: '1',
    isLoading: false,
  }),
  useFetchAcademicYear: () => ({
    data: '2024',
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
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
vi.mock('framer-motion', () => ({
  LazyMotion: ({ children }: any) => children,
  domAnimation: {},
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

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

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Trash2: () => <span data-testid="trash2-icon" />,
  CircleAlert: () => <span data-testid="circle-alert-icon" />,
  ChevronLeft: () => <span data-testid="chevron-left-icon" />,
  ChevronRight: () => <span data-testid="chevron-right-icon" />,
  BookOpen: () => <span data-testid="book-open-icon" />,
}));

// Mock attendance-reconciliation
vi.mock('@/lib/logic/attendance-reconciliation', () => ({
  getOfficialSessionRaw: vi.fn((session: any, sessionKey: string | number) => {
    if (session && session.session != null && session.session !== '') return session.session;
    return sessionKey;
  }),
}));

import { useTrackingData } from '@/hooks/tracker/useTrackingData';
import { useTrackingCount } from '@/hooks/tracker/useTrackingCount';

// Shared sample tracking item matching semester/year from the useFetchSemester/useFetchAcademicYear mocks
const sampleTrackingItem = {
  auth_user_id: 'auth-user-123',
  course: 'CS101',
  session: '1',
  date: '20240901',
  attendance: 111,
  status: 'extra',
  semester: '1',
  year: '2024',
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
      vi.mocked(useTrackingData).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn().mockResolvedValue({ data: null, isLoading: true, error: null }),
      } as any);
      render(<TrackingClient />);
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
      const clearBtn = await screen.findByRole('button', { name: /clear all 1 tracked class/i });
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
      const clearBtn = await screen.findByRole('button', { name: /clear all 2 tracked classes/i });
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
        from: vi.fn(() => ({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Supabase delete failed') }),
        })),
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
});
