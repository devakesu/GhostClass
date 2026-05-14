/** @vitest-environment jsdom */
import { describe, it, vi, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AttendanceCalendar } from '../attendance-calendar';

// Mock required hooks and components
vi.mock('@/hooks/users/profile', () => ({
  useProfile: () => ({ data: { id: '123' }, isLoading: false }),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: () => ({ data: 0, isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: 'even', isLoading: false }),
  useFetchAcademicYear: () => ({ data: '2024-25', isLoading: false }),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: () => ({ isDisabled: () => false }),
}));

vi.mock('@/hooks/courses/useCourseLookup', () => ({
  useCourseLookup: () => ({
    getCourseCodeById: (id: string) => id,
    getCourseNameById: (id: string) => id,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: () => ({ data: [] }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { 
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: '123' } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: '123' } } })
    },
    from: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    ChevronLeft: Icon, ChevronRight: Icon, Calendar: Icon, Clock: Icon,
    CheckCircle2: Icon, AlertCircle: Icon, Sparkles: Icon, Trash2: Icon,
    ArrowUpRight: Icon, Briefcase: Icon, Loader2: Icon, AlertTriangle: Icon
  };
});

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectTrigger: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
  SelectContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectItem: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectValue: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => <button {...props} onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: React.PropsWithChildren) => <label>{children}</label>,
}));

describe('AttendanceCalendar Coverage Hardening', () => {
  beforeEach(() => {
    const testDate = new Date(2024, 8, 1); // Sept 1, 2024
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(testDate.toISOString());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders and shows actions for Absent official session', async () => {
    const mockAttendanceData = {
      studentAttendanceData: {
        '20240901': {
          '1': { course: 'CS101', session: '1', attendance: 111 } // Absent
        }
      },
      sessions: { '1': { name: '1st Hour' } }
    };

    render(<AttendanceCalendar attendanceData={mockAttendanceData as unknown as React.ComponentProps<typeof AttendanceCalendar>['attendanceData']} semester="odd" year="2024-25" />);
    
    // Select the date
    const dateBtn = await screen.findByLabelText(/September 1, 2024/i);
    fireEvent.click(dateBtn);

    // Check for "Mark DL" and "Mark Present" buttons (Absent actions)
    expect(await screen.findByText(/Mark DL/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark Present/i)).toBeInTheDocument();
  });

  it('handles delete confirmation dialog', async () => {
    const { useTrackingData } = await import('@/hooks/tracker/useTrackingData');
    vi.mocked(useTrackingData).mockReturnValue({
      data: [{ id: 't1', course: 'CS101', session: '2nd Hour', date: '20240901', status: 'extra', semester: 'odd', year: '2024-25', attendance: 110 }],
      isLoading: false,
      refetch: vi.fn()
    } as unknown as ReturnType<typeof useTrackingData>);

    const mockAttendanceData = {
      studentAttendanceData: {
        '20240901': {
          '1': { course: 'CS101', session: '1', attendance: 111 }
        }
      },
      sessions: { '1': { name: '1st Hour' } }
    };
    render(<AttendanceCalendar attendanceData={mockAttendanceData as unknown as React.ComponentProps<typeof AttendanceCalendar>['attendanceData']} semester="odd" year="2024-25" />);
    
    const dateBtn = await screen.findByLabelText(/September 1, 2024/i);
    await act(async () => {
      fireEvent.click(dateBtn);
    });

    const deleteBtn = await screen.findByLabelText(/Delete self-marked/i);
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(await screen.findByText('Delete Record')).toBeInTheDocument();
    const confirmBtn = screen.getByText('DELETE');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    // Should trigger handleDeleteTrackData
  });
});
