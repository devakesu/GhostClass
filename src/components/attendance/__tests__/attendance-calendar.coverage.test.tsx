/** @vitest-environment jsdom */
import { describe, it, vi, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
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
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => <button {...props} onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
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

    render(<AttendanceCalendar attendanceData={mockAttendanceData as any} semester="odd" year="2024-25" />);
    
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
    } as any);

    const mockAttendanceData = {
      studentAttendanceData: {
        '20240901': {
          '1': { course: 'CS101', session: '1', attendance: 111 }
        }
      },
      sessions: { '1': { name: '1st Hour' } }
    };
    render(<AttendanceCalendar attendanceData={mockAttendanceData as any} semester="odd" year="2024-25" />);
    
    const dateBtn = await screen.findByLabelText(/September 1, 2024/i);
    fireEvent.click(dateBtn);

    const deleteBtn = await screen.findByLabelText(/Delete self-marked/i);
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Delete Record')).toBeInTheDocument();
    const confirmBtn = screen.getByText('DELETE');
    fireEvent.click(confirmBtn);
    // Should trigger handleDeleteTrackData
  });
});
