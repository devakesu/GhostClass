/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardClient from '../DashboardClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as profileHooks from '@/hooks/users/profile';
import * as coursesHooks from '@/hooks/courses/courses';
import * as syncHooks from '@/hooks/use-sync-on-mount';
import * as attendanceHooks from '@/hooks/courses/attendance';

type MockCourse = {
  id: number;
  code: string;
  name?: string;
  key?: string;
};

type MockComponentProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

type MotionProps = MockComponentProps & {
  initial?: unknown;
  animate?: unknown;
  transition?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
  exit?: unknown;
};

// Mock all hooks
vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({ data: { first_name: 'Test', last_name: 'User', username: 'testuser', id: 1, class: { id: 1, name: 'Test Class' } }, isLoading: false, isFetching: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: vi.fn(() => ({ data: null, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() })),
  useAllCourseDetails: vi.fn(() => ({ data: {}, isLoading: false, isFetching: false, isError: false })),
  useAllCourseSummaries: vi.fn(() => ({ data: {}, isLoading: false })),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: vi.fn(() => ({ data: { courses: {} }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchUserSettings: vi.fn(() => ({ data: { semester: 'odd', academicYear: '2024-25' }, isLoading: false })),
  useSetSemester: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, mutate: vi.fn() })),
  useSetAcademicYear: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, mutate: vi.fn() })),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/courses/instructors', () => ({
  useFetchCourseInstructors: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: vi.fn(() => ({
    realPresent: 0,
    realTotal: 0,
    percentage: 0,
    courseStats: {},
  })),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({ syncSettled: true, syncFailed: false })),
}));

vi.mock('../components/CourseGrid', () => ({
  CourseGrid: ({ sortedCourses = [], onEditInstructor, onAddCourse }: { sortedCourses?: MockCourse[]; onEditInstructor?: (course: MockCourse, instructor: string, open: boolean, value: unknown) => void; onAddCourse?: () => void }) => (
    <div data-testid="course-grid">
      <button onClick={onAddCourse}>Add Course</button>
      {sortedCourses.map((c) => (
        <button key={c.id} onClick={() => onEditInstructor?.(c, 'Instructor', false, null)}>
          Edit {c.code}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../components/StatsPanel', () => ({
  StatsPanel: () => <div data-testid="stats-panel" />,
}));

vi.mock('../components/DashboardCharts', () => ({
  DashboardCharts: () => <div data-testid="dashboard-charts" />,
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: vi.fn(() => ({ targetPercentage: 75 })),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({ 
    disabledCodes: new Set(),
    isDisabled: vi.fn(() => false)
  })),
}));

vi.mock('@/hooks/courses/useCourseLookup', () => ({
  useCourseLookup: vi.fn(() => ({ getCourseCodeById: vi.fn() })),
}));

vi.mock('framer-motion', () => {
  const mockComponent = ({ children, ...rest }: MotionProps) => {
    return <div {...rest}>{children}</div>;
  };
  return {
    motion: {
      div: mockComponent,
      h1: mockComponent,
      p: mockComponent,
      span: mockComponent,
    },
    m: {
      div: mockComponent,
      h1: mockComponent,
      p: mockComponent,
      span: mockComponent,
    },
    AnimatePresence: ({ children }: MockComponentProps) => <>{children}</>,
    LazyMotion: ({ children }: MockComponentProps) => <>{children}</>,
    domAnimation: {},
  };
});

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading">Full Loading...</div>,
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-component" />,
}));

// Mock Select to trigger onValueChange
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value, disabled }: { children?: ReactNode; onValueChange?: (value: string) => void; value?: string; disabled?: boolean }) => (
    <div data-testid="mock-select" data-value={value} data-disabled={disabled}>
      <button onClick={() => !disabled && onValueChange?.('even')}>Change to EVEN</button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockComponentProps) => <button>{children}</button>,
  SelectContent: ({ children }: MockComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: ReactNode; value?: string }) => <div data-value={value}>{children}</div>,
}));

// Mock AlertDialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children?: ReactNode; open?: boolean }) => open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  AlertDialogContent: ({ children }: MockComponentProps) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: MockComponentProps) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: MockComponentProps) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: MockComponentProps) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: MockComponentProps) => <div>{children}</div>,
}));

vi.mock('@/components/attendance/AddAttendanceDialog', () => ({
  AddAttendanceDialog: ({ onSuccess, open }: { onSuccess?: () => void; open?: boolean }) => (
    open ? <div data-testid="add-attendance-dialog">
      <button onClick={onSuccess}>Trigger Success</button>
    </div> : null
  ),
}));

vi.mock('@/components/attendance/AddCourseDialog', () => ({
  AddCourseDialog: ({ open }: { open?: boolean }) => open ? <div data-testid="add-course-dialog" /> : null,
}));

vi.mock('@/components/attendance/EditInstructorDialog', () => ({
  EditInstructorDialog: ({ open }: { open?: boolean }) => open ? <div data-testid="edit-instructor-dialog" /> : null,
}));

vi.mock('@/components/attendance/SelectClassDialog', () => ({
  SelectClassDialog: () => null,
}));

// Mock axios
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe('DashboardClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncHooks.useSyncOnMount).mockReturnValue({ isSyncing: false, syncSettled: true, syncFailed: false });
    vi.mocked(profileHooks.useProfile).mockReturnValue({ 
      data: { first_name: 'Test', last_name: 'User', username: 'testuser', id: 1, class: { name: 'Test Class' } }, 
      isLoading: false, 
      isFetching: false, 
      refetch: vi.fn() 
    } as any);
  });

  it('handles semester change and confirm', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardClient />
      </QueryClientProvider>
    );

    const nextButton = await screen.findByLabelText('Go to next academic period');
    fireEvent.click(nextButton);

    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument());
  });

  it('triggers onEditInstructor from CourseGrid', async () => {
    vi.mocked(coursesHooks.useFetchCourses).mockReturnValue({ 
      data: { courses: { '1': { id: 1, code: 'CS101', name: 'Computer Science' } } }, 
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn()
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardClient />
      </QueryClientProvider>
    );

    const editButton = await screen.findByText('Edit CS101');
    fireEvent.click(editButton);

    expect(screen.getByTestId('edit-instructor-dialog')).toBeInTheDocument();
  });

  it('shows loading message when attendance is loading but profile has loaded', async () => {
    vi.mocked(attendanceHooks.useAttendanceReport).mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardClient />
      </QueryClientProvider>
    );

    // Welcome message with name is visible
    expect(await screen.findByText(/Welcome back,/i)).toBeInTheDocument();
    expect(screen.getByText(/Test User!/i)).toBeInTheDocument();

    // Data panels and charts are NOT visible
    expect(screen.queryByTestId('stats-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-charts')).not.toBeInTheDocument();

    // Loader is visible
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
