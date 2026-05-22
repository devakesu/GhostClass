/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardClient from '../DashboardClient';
import { useProfile } from '@/hooks/users/profile';
import { useAttendanceReport, useAllCourseDetails } from '@/hooks/courses/attendance';
import { useFetchCourses } from '@/hooks/courses/courses';
import { useFetchUserSettings, useSetAcademicYear, useSetSemester } from '@/hooks/users/settings';
import { useTrackingData } from '@/hooks/tracker/useTrackingData';
import { useFetchCourseInstructors } from '@/hooks/courses/instructors';
import { useFetchClassCourses } from '@/hooks/courses/useFetchClassCourses';
import { useDisabledCourses } from '@/hooks/courses/useDisabledCourses';
import { useCourseLookup } from '@/hooks/courses/useCourseLookup';
import { useSyncOnMount } from '@/hooks/use-sync-on-mount';
import { toast } from 'sonner';

// Mock all required hooks
vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: vi.fn(),
  useAllCourseDetails: vi.fn(),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: vi.fn(),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchUserSettings: vi.fn(),
  useSetAcademicYear: vi.fn(),
  useSetSemester: vi.fn(),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(),
}));

vi.mock('@/hooks/courses/instructors', () => ({
  useFetchCourseInstructors: vi.fn(),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: vi.fn(),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(),
}));

vi.mock('@/hooks/courses/useCourseLookup', () => ({
  useCourseLookup: vi.fn(),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    cancelQueries: vi.fn(),
  })),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: vi.fn(() => ({ targetPercentage: 75 })),
}));

// Mock components that are heavy or problematic
vi.mock('@/components/attendance/course-card', () => ({
  CourseCard: ({ course, onEditInstructor }: any) => (
    <div data-testid="course-card">
      {course.name}
      <button data-testid="edit-instructor-btn" onClick={onEditInstructor}>Edit</button>
    </div>
  ),
}));

vi.mock('@/components/pwa-install-banner', () => ({
  PWAInstallBanner: () => <div data-testid="pwa-banner" />,
}));

vi.mock('@/components/attendance/AddAttendanceDialog', () => ({
  AddAttendanceDialog: ({ onSuccess }: any) => (
    <div data-testid="add-attendance-dialog">
      <button data-testid="trigger-success" onClick={onSuccess}>Success</button>
    </div>
  ),
}));

vi.mock('@/components/attendance/AddCourseDialog', () => ({
  AddCourseDialog: ({ open }: any) => (open ? <div data-testid="add-course-dialog" /> : null),
}));

vi.mock('@/components/attendance/EditInstructorDialog', () => ({
  EditInstructorDialog: ({ open }: any) => (open ? <div data-testid="edit-instructor-dialog" /> : null),
}));

vi.mock('@/components/attendance/SelectClassDialog', () => ({
  SelectClassDialog: () => null,
}));

vi.mock('next/dynamic', () => ({
  default: () => {
    return function DynamicComponent() {
      return <div data-testid="dynamic-component">Dynamic</div>;
    };
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value, disabled }: any) => (
    <select 
      value={value} 
      onChange={(e) => onValueChange(e.target.value)} 
      disabled={disabled}
      data-testid="select-component"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardFooter: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading-overlay">Loading...</div>,
}));

describe('DashboardClient', () => {
  const mockProfile = { id: '123', username: 'testuser', first_name: 'Test', class: { id: '1', name: 'Test Class' } };
  
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    
    vi.mocked(useProfile).mockReturnValue({ data: mockProfile, isLoading: false, isFetching: false, refetch: vi.fn() } as any);
    vi.mocked(useFetchUserSettings).mockReturnValue({ data: { semester: 'odd', academicYear: '2024-25' }, isLoading: false } as any);
    vi.mocked(useAttendanceReport).mockReturnValue({ data: { studentAttendanceData: {}, sessions: {} }, isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}) } as any);
    vi.mocked(useFetchCourses).mockReturnValue({ data: { courses: {} }, isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}) } as any);
    vi.mocked(useTrackingData).mockReturnValue({ data: [], isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue([]) } as any);
    vi.mocked(useFetchCourseInstructors).mockReturnValue({ data: [] } as any);
    vi.mocked(useFetchClassCourses).mockReturnValue({ data: [] } as any);
    vi.mocked(useDisabledCourses).mockReturnValue({ disabledCodes: new Set() } as any);
    vi.mocked(useCourseLookup).mockReturnValue({ getCourseCodeById: vi.fn((id) => id) } as any);
    vi.mocked(useAllCourseDetails).mockReturnValue({ data: [], isLoading: false, isFetching: false } as any);
    vi.mocked(useSyncOnMount).mockReturnValue({ syncCompleted: true, isSyncing: false } as any);
    vi.mocked(useSetSemester).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false } as any);
    vi.mocked(useSetAcademicYear).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false } as any);
  });

  it('renders correctly with default settings', async () => {
    render(<DashboardClient />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ODD 2024-25/i).length).toBeGreaterThan(0);
  });

  it('does not seed the attendance query with initial data', async () => {
    render(<DashboardClient initialData={{ courses: [], attendance: { studentAttendanceData: { stale: true } } }} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });

    expect(vi.mocked(useAttendanceReport)).toHaveBeenCalledWith(
      'odd',
      '2024-25',
      expect.not.objectContaining({ initialData: expect.anything() }),
    );
  });

  it('handles serverError by showing a toast', () => {
    render(<DashboardClient serverError="Test error message" />);
    expect(toast.error).toHaveBeenCalledWith('Dashboard Pre-fetch Failed', expect.any(Object));
  });

  it('handles 429 serverError specially', () => {
    render(<DashboardClient serverError="Error: 429 Rate Limit" />);
    expect(toast.error).toHaveBeenCalledWith('EzyGo Rate Limit Reached', expect.any(Object));
  });

  it('shows confirmation dialog when changing semester', async () => {
    render(<DashboardClient />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Go to next academic period'));
    
    expect(screen.getByText(/Confirm academic period change/i)).toBeInTheDocument();
  });

  it('calculates stats correctly', async () => {
    vi.mocked(useAttendanceReport).mockReturnValue({
      data: {
        studentAttendanceData: {
          '20240901': {
            '1': { course: '101', attendance: 111, class_type: 'Regular' }, // Absent
            '2': { course: '101', attendance: 110, class_type: 'Regular' }, // Present
          }
        },
        sessions: { '1': { name: '1st Hour' }, '2': { name: '2nd Hour' } }
      },
      isLoading: false, isFetching: false, refetch: vi.fn()
    } as any);

    vi.mocked(useFetchCourses).mockReturnValue({
      data: {
        courses: {
          '101': { id: '101', name: 'Computer Science 101', code: 'CS101' }
        }
      },
      isLoading: false, isFetching: false, refetch: vi.fn()
    } as any);

    render(<DashboardClient />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(screen.getByTestId('course-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Computer Science 101')).toBeInTheDocument();
  });

  it('shows empty state when no courses are found', async () => {
    vi.mocked(useFetchCourses).mockReturnValue({ data: { courses: {} }, isLoading: false } as any);
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText(/No courses found/i)).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByText('Add Your First Course'));
    await waitFor(() => {
      expect(screen.getByTestId('add-course-dialog')).toBeInTheDocument();
    });
  });

  it('handles confirm and cancel in AlertDialog', async () => {
    const mockMutate = vi.fn().mockResolvedValue({});
    vi.mocked(useSetSemester).mockReturnValue({ mutateAsync: mockMutate, isPending: false } as any);
    
    render(<DashboardClient />);
    await waitFor(() => expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Go to next academic period'));
    
    // Cancel first
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();

    // Trigger again and confirm
    fireEvent.click(screen.getByLabelText('Go to next academic period'));
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  it('handles AddAttendanceDialog success callback', async () => {
    const refetchAttendance = vi.fn().mockResolvedValue({});
    vi.mocked(useAttendanceReport).mockReturnValue({ data: { studentAttendanceData: {}, sessions: {} }, isLoading: false, refetch: refetchAttendance } as any);
    
    render(<DashboardClient />);
    await waitFor(() => expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument());
    
    const successBtn = screen.getByTestId('trigger-success');
    fireEvent.click(successBtn);
    expect(refetchAttendance).toHaveBeenCalled();
  });

  it('opens EditInstructorDialog from CourseCard', async () => {
    vi.mocked(useFetchCourses).mockReturnValue({
      data: { courses: { '101': { id: '101', name: 'CS', code: 'CS101' } } },
      isLoading: false
    } as any);

    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByTestId('course-card')).toBeInTheDocument());
    
    const editBtn = screen.getByTestId('edit-instructor-btn');
    fireEvent.click(editBtn);
    expect(screen.getByTestId('edit-instructor-dialog')).toBeInTheDocument();
  });

  it('opens AddCourseDialog from add course card', async () => {
    vi.mocked(useFetchCourses).mockReturnValue({
      data: { courses: { '101': { id: '101', name: 'CS' } } },
      isLoading: false
    } as any);

    render(<DashboardClient />);
    await waitFor(() => expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument());
    
    fireEvent.click(screen.getByText(/Can't find a course/i));
    await waitFor(() => {
      expect(screen.getByTestId('add-course-dialog')).toBeInTheDocument();
    });
  });
});
