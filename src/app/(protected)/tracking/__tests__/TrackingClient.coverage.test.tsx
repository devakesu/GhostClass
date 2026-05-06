/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrackingClient from '../TrackingClient';

// Mock all required hooks
vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(),
}));

vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: vi.fn(),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({
    data: { id: '123' },
    isLoading: false,
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({ data: { id: '123' }, isLoading: false }),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: 'even', isLoading: false }),
  useFetchAcademicYear: () => ({ data: '2024-25', isLoading: false }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    isDisabled: vi.fn(() => false),
  })),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({
    isSyncing: false,
    syncCompleted: true,
  })),
}));

vi.mock('@/hooks/courses/useCourseLookup', () => ({
  useCourseLookup: () => ({
    getCourseCodeById: (id: string) => id,
    getCourseNameById: (id: string) => id,
  }),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: () => ({ data: [] }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: '123' } } }) },
    from: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), dev: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('framer-motion', () => ({
  LazyMotion: ({ children }: any) => children,
  domAnimation: {},
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/alert-dialog', async () => {
  const React = await import('react');
  return {
    AlertDialog: ({ children, open, onOpenChange }: any) => {
      if (!open) return null;
      return (
        <div data-testid="alert-dialog">
          {React.Children.map(children, (child: any) =>
            React.isValidElement(child) ? React.cloneElement(child, { onOpenChange } as any) : child
          )}
        </div>
      );
    },
    AlertDialogContent: ({ children, onOpenChange }: any) => (
      <div>
        {React.Children.map(children, (child: any) =>
          React.isValidElement(child) ? React.cloneElement(child, { onOpenChange } as any) : child
        )}
      </div>
    ),
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogFooter: ({ children, onOpenChange }: any) => (
      <div>
        {React.Children.map(children, (child: any) =>
          React.isValidElement(child) ? React.cloneElement(child, { onOpenChange } as any) : child
        )}
      </div>
    ),
    AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
    AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
    AlertDialogAction: ({ children, onClick, onOpenChange }: any) => (
      <button onClick={async (e) => { 
        if (onClick) await onClick(e);
        if (onOpenChange) onOpenChange(false);
      }}>{children}</button>
    ),
    AlertDialogCancel: ({ children, onClick, onOpenChange }: any) => (
      <button onClick={async (e) => {
        if (onClick) await onClick(e);
        if (onOpenChange) onOpenChange(false);
      }}>{children}</button>
    ),
  };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => (
    <div data-testid="select-root">{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    Trash2: Icon, CircleAlert: Icon, ChevronLeft: Icon, ChevronRight: Icon,
    ChevronDown: Icon, BookOpen: Icon, ArrowDown: Icon, Filter: Icon, Loader2: Icon,
    ChevronDownIcon: Icon, ChevronUpIcon: Icon, CheckIcon: Icon
  };
});

import { useTrackingData } from '@/hooks/tracker/useTrackingData';
import { useTrackingCount } from '@/hooks/tracker/useTrackingCount';

describe('TrackingClient Coverage Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "No Tracking History" when data is empty', async () => {
    vi.mocked(useTrackingData).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useTrackingCount).mockReturnValue({ data: 0, isLoading: false } as any);

    render(<TrackingClient />);
    expect(screen.getByText('No Tracking History')).toBeInTheDocument();
  });

  it('renders correction with Present status (isCorrection + green)', async () => {
    const item = {
      id: '1', auth_user_id: '123', course: 'CS101', session: '1', date: '20240901',
      attendance: 110, status: 'correction', semester: 'even', year: '2024-25'
    };
    vi.mocked(useTrackingData).mockReturnValue({ data: [item], isLoading: false } as any);
    vi.mocked(useTrackingCount).mockReturnValue({ data: 1, isLoading: false } as any);

    render(<TrackingClient />);
    // Check if the card is rendered (Absent → Present)
    expect(await screen.findByText(/Absent → Present/i)).toBeInTheDocument();
  });

  it('toggles expansion when there are many records', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: `${i}`, auth_user_id: '123', course: 'CS101', session: `${i}`, date: `2024090${(i % 9) + 1}`,
      attendance: 110, status: 'extra', semester: 'even', year: '2024-25'
    }));
    vi.mocked(useTrackingData).mockReturnValue({ data: items, isLoading: false } as any);
    vi.mocked(useTrackingCount).mockReturnValue({ data: 15, isLoading: false } as any);

    render(<TrackingClient />);
    
    const showMoreBtn = await screen.findByText(/Show 5 More Records/i);
    fireEvent.click(showMoreBtn);
    expect(screen.getByText('Show Less')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show Less'));
    expect(screen.getByText(/Show 5 More Records/i)).toBeInTheDocument();
  });

  it('handles pagination', async () => {
    // coursesPerPage is 3. Providing 6 courses gives exactly 2 pages.
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`, auth_user_id: '123', course: `COURSE-${i}`, session: '1', date: '20240901',
      attendance: 110, status: 'extra', semester: 'even', year: '2024-25'
    }));
    vi.mocked(useTrackingData).mockReturnValue({ data: items, isLoading: false } as any);
    vi.mocked(useTrackingCount).mockReturnValue({ data: 6, isLoading: false } as any);

    render(<TrackingClient />);
    
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    const nextBtn = screen.getByLabelText('Next page');
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    const prevBtn = screen.getByLabelText('Previous page');
    fireEvent.click(prevBtn);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('triggers delete confirmation dialog', async () => {
    const item = {
      id: '1', auth_user_id: '123', course: 'CS101', session: '1', date: '20240901',
      attendance: 110, status: 'extra', semester: 'even', year: '2024-25'
    };
    vi.mocked(useTrackingData).mockReturnValue({ data: [item], isLoading: false } as any);
    vi.mocked(useTrackingCount).mockReturnValue({ data: 1, isLoading: false } as any);

    render(<TrackingClient />);
    
    const removeBtn = await screen.findByLabelText(/Remove tracking entry/i);
    fireEvent.click(removeBtn);
    expect(screen.getByText('Delete Record')).toBeInTheDocument();
    
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByText('Delete Record')).not.toBeInTheDocument();
    });
  });
;
});
