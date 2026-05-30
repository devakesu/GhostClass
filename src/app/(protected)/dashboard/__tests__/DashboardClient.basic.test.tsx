import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

// Mock lucide-react at the very top
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const Icon = (props: Record<string, unknown>) => actual.createElement('div', props);
  return {
    __esModule: true,
    AlertCircle: Icon,
    AlertTriangle: Icon,
    ArrowLeft: Icon,
    ArrowRight: Icon,
    BarChart3: Icon,
    Bell: Icon,
    BookPlus: Icon,
    Building2: Icon,
    Calendar: Icon,
    Check: Icon,
    CheckCircle2: Icon,
    CheckIcon: Icon,
    ChevronDownIcon: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    ChevronRightIcon: Icon,
    ChevronUpIcon: Icon,
    CircleIcon: Icon,
    Clock: Icon,
    Coffee: Icon,
    Copy: Icon,
    Download: Icon,
    Edit2: Icon,
    ExternalLink: Icon,
    Eye: Icon,
    EyeOff: Icon,
    FileText: Icon,
    Ghost: Icon,
    Home: Icon,
    Info: Icon,
    LayoutDashboard: Icon,
    Loader2: Icon,
    LockIcon: Icon,
    LogOut: Icon,
    Mail: Icon,
    MessageSquare: Icon,
    Pencil: Icon,
    Phone: Icon,
    Plus: Icon,
    RefreshCcw: Icon,
    RefreshCw: Icon,
    RotateCcw: Icon,
    Send: Icon,
    ShieldCheck: Icon,
    Star: Icon,
    Trash2: Icon,
    User: Icon,
    User2: Icon,
    UserCircle2: Icon,
    UserCog: Icon,
    X: Icon,
    XCircle: Icon,
    XIcon: Icon,
    BookOpen: Icon,
    GraduationCap: Icon,
  };
});

import { render, screen } from '@testing-library/react';
import DashboardClient from '../DashboardClient';
import { toast } from 'sonner';

// Mock all the hooks
vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({ 
    data: { username: 'testuser' }, 
    isLoading: false, 
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({}) 
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ 
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchUserSettings: vi.fn(() => ({ data: { semester: 'even', academicYear: '2023-24' }, isLoading: false })),
  useSetSemester: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useSetAcademicYear: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: vi.fn(() => ({ targetPercentage: 75 })),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: vi.fn(() => ({ 
    data: { studentAttendanceData: {} }, 
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({})
  })),
  useAllCourseDetails: vi.fn(() => ({ 
    data: [], 
    isLoading: false,
    isFetching: false
  })),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: vi.fn(() => ({ 
    data: { courses: {} }, 
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({})
  })),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({ 
    data: [], 
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({})
  })),
}));

vi.mock('@/hooks/courses/instructors', () => ({
  useFetchCourseInstructors: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/courses/useCourseLookup', () => ({
  useCourseLookup: vi.fn(() => ({ getCourseCodeById: vi.fn() })),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({ isSyncing: false, syncSettled: true, syncFailed: false })),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCodes: vi.fn(() => new Set()),
  useDisabledCourses: vi.fn(() => ({ disabledCodes: new Set() })),
}));

// Mock components that are dynamic or complex
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-component">Dynamic Component</div>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/sentry-lazy', () => ({
  captureSentryException: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock Framer Motion to avoid issues with animations
type MockComponentProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: MockComponentProps) => <>{children}</>,
  LazyMotion: ({ children }: MockComponentProps) => <>{children}</>,
  domAnimation: {},
  m: {
    div: ({ children, ...props }: MockComponentProps) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: MockComponentProps) => <section {...props}>{children}</section>,
    h2: ({ children, ...props }: MockComponentProps) => <h2 {...props}>{children}</h2>,
  },
}));

describe('DashboardClient Basic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with initial data', async () => {
    render(<DashboardClient initialData={{ courses: [], attendance: {} }} />);
    
    // Check for some key elements in the dashboard
    // Use findByText to wait for the initial loading state (CompLoading) to finish
    expect(await screen.findByText(/Attendance Overview/i)).toBeInTheDocument();
  });

  it('shows error toast if serverError is provided', () => {
    render(<DashboardClient serverError="500 Internal Server Error" />);
    
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Dashboard Pre-fetch Failed'),
      expect.any(Object)
    );
  });

  it('shows rate limit toast if 429 error is provided', () => {
    render(<DashboardClient serverError="429 Too Many Requests" />);
    
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('EzyGo Rate Limit Reached'),
      expect.any(Object)
    );
  });
});
