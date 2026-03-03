import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttendanceCalendar } from '../attendance-calendar';

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: '1', isLoading: false }),
  useFetchAcademicYear: () => ({ data: '2024', isLoading: false }),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: null }),
  })),
}));

vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: vi.fn(() => ({
    data: 0,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: 0 }),
  })),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-user-123' } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'auth-user-123' } } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  AlertDialogCancel: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/lib/error-handling', () => ({
  isDutyLeaveConstraintError: vi.fn(() => false),
  getDutyLeaveErrorMessage: vi.fn(() => 'Duty leave limit reached'),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, ...props }: any) => <div role="option" data-value={value} {...props}>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="chevron-left" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
  Calendar: () => <span data-testid="calendar-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
  CheckCircle2: () => <span data-testid="check-circle-icon" />,
  AlertCircle: () => <span data-testid="alert-circle-icon" />,
  Briefcase: () => <span data-testid="briefcase-icon" />,
  Sparkles: () => <span data-testid="sparkles-icon" />,
  Trash2: () => <span data-testid="trash2-icon" />,
  Loader2: () => <span data-testid="loader2-icon" />,
  AlertTriangle: () => <span data-testid="alert-triangle-icon" />,
  ArrowUpRight: () => <span data-testid="arrow-up-right-icon" />,
  XIcon: () => <span data-testid="x-icon" />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ ...props }: any) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

describe('AttendanceCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub sessionStorage to avoid browser API issues in jsdom
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render the calendar heading', async () => {
    render(<AttendanceCalendar attendanceData={undefined} />);

    // The calendar renders a heading (h3) with month/year
    const heading = await screen.findByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
  });

  it('should render previous and next navigation buttons', async () => {
    render(<AttendanceCalendar attendanceData={undefined} />);

    const prevBtn = await screen.findByRole('button', { name: /previous month/i });
    const nextBtn = await screen.findByRole('button', { name: /next month/i });

    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();
  });

  it('should call handleDlConfirm and close dialog when Confirm is clicked', async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const mockAttendanceData = {
      courses: { '42': { name: 'Test Course', code: 'TC101' } },
      sessions: {},
      attendanceTypes: {},
      studentAttendanceData: {
        [todayStr]: {
          '1': { course: '42', attendance: 111, session: '1' },
        },
      },
      attendanceDatesArray: {},
    };

    render(<AttendanceCalendar attendanceData={mockAttendanceData as any} />);

    // Wait for Mark DL button then open dialog
    const markDlBtn = await screen.findByRole('button', { name: /mark.*duty leave/i });
    fireEvent.click(markDlBtn);

    const reasonInput = await screen.findByPlaceholderText('Programme/Activity Name');
    expect(reasonInput).toBeInTheDocument();

    // Click Confirm – should call handleDlConfirm and close the dialog
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Programme/Activity Name')).not.toBeInTheDocument();
    });
  });

  it('should open DL reason dialog when Mark DL is clicked, and close on cancel', async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const mockAttendanceData = {
      courses: { '42': { name: 'Test Course', code: 'TC101' } },
      sessions: {},
      attendanceTypes: {},
      studentAttendanceData: {
        [todayStr]: {
          '1': { course: '42', attendance: 111, session: '1' },
        },
      },
      attendanceDatesArray: {},
    };

    render(<AttendanceCalendar attendanceData={mockAttendanceData as any} />);

    // Dialog input should not be visible before clicking
    expect(screen.queryByPlaceholderText('Programme/Activity Name')).not.toBeInTheDocument();

    // Wait for Mark DL button (requires calendar + auth to initialize)
    const markDlBtn = await screen.findByRole('button', { name: /mark.*duty leave/i });

    // Click Mark DL – dialog should open
    await waitFor(() => {
      fireEvent.click(markDlBtn);
      expect(screen.queryByPlaceholderText('Programme/Activity Name')).toBeInTheDocument();
    });

    // Click Cancel – dialog should close
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Programme/Activity Name')).not.toBeInTheDocument();
    });
  });
});
