import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { CourseCard, ExtendedCourse } from '../course-card';
import { useCourseDetails } from '@/hooks/courses/attendance';
import { toast } from 'sonner';

vi.mock('@/hooks/courses/attendance', () => ({
  useCourseDetails: vi.fn(() => ({
    data: { present: 15, total: 20, absent: 5 },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: () => ({
    data: { id: '123', email: 'test@example.com' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: () => ({
    targetPercentage: 75,
    absenceIncludesOtherLeave: false,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    },
  })),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    AlertCircle: () => <span data-testid="alert-circle-icon" />,
  };
});

// Mock disabled courses hook
const mockDisableCourse = vi.fn();
const mockEnableCourse = vi.fn();

const defaultDisabledCoursesReturn = {
  isDisabled: (() => false) as (code: string) => boolean,
  getDisableReason: (() => null) as (code: string) => string | null,
  disableCourse: mockDisableCourse,
  enableCourse: mockEnableCourse,
  disabledCodes: new Set<string>(),
  disabledCoursesMap: {},
  isLoading: false,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockUseDisabledCourses = vi.fn((_opts?: unknown) => defaultDisabledCoursesReturn);

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: (opts: unknown) => mockUseDisabledCourses(opts),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: 'even' }),
  useFetchAcademicYear: () => ({ data: '2025-2026' }),
  useFetchUserSettings: () => ({ data: { semester: 'even', academicYear: '2025-2026' } }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

const sampleCourse: ExtendedCourse = {
  id: 42,
  name: 'Computer Science',
  code: 'CS101',
  present: 15,
  total: 20,
  officialPresent: 15,
  officialTotal: 20,
};

function createDeferredPromise<T>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = (value) => res(value as T | PromiseLike<T>);
  });
  return { promise, resolve };
}

describe('CourseCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDisabledCourses.mockReturnValue(defaultDisabledCoursesReturn);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render the course name', async () => {
    render(<CourseCard course={sampleCourse} />);

    expect(await screen.findByText('Computer Science')).toBeInTheDocument();
  });

  it('should render the course code badge', async () => {
    render(<CourseCard course={sampleCourse} />);

    expect(await screen.findByText('CS101')).toBeInTheDocument();
  });

  it('should render attendance stats when data is available', async () => {
    render(<CourseCard course={sampleCourse} />);

    expect(await screen.findByText('Present')).toBeInTheDocument();
    expect(await screen.findByText('Absent')).toBeInTheDocument();
    expect(await screen.findByText('Total')).toBeInTheDocument();
  });

  describe('statusColorClasses', () => {
    it('applies green border by default even when there is no attendance data (isLoading)', async () => {
      vi.mocked(useCourseDetails).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useCourseDetails>);
      const noDataCourse: ExtendedCourse = { id: 1, name: 'No Data Course', code: 'ND101' };
      const { container } = render(<CourseCard course={noDataCourse} />);
      const card = container.querySelector('.custom-container');
      expect(card?.className).toMatch(/border-t-green-500/);
    });

    it('applies green top border when attendance is at or above target', async () => {
      // 15/20 = 75% = target
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 15, total: 20, absent: 5 }, isLoading: false } as unknown as ReturnType<typeof useCourseDetails>);
      const { container } = render(<CourseCard course={sampleCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Computer Science')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-green-500/);
    });

    it('applies amber top border when attendance is within 10% below target', async () => {
      // 10/15 ≈ 66.67%, target=75, target-10=65 → amber
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 10, total: 15, absent: 5 }, isLoading: false } as unknown as ReturnType<typeof useCourseDetails>);
      const amberCourse: ExtendedCourse = { id: 2, name: 'Amber Course', code: 'AM202', present: 10, total: 15 };
      const { container } = render(<CourseCard course={amberCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Amber Course')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-red-500/);
    });

    it('applies red top border when attendance is more than 10% below target', async () => {
      // 6/15 = 40%, target=75, target-10=65 → red
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 6, total: 15, absent: 9 }, isLoading: false } as unknown as ReturnType<typeof useCourseDetails>);
      const redCourse: ExtendedCourse = { id: 3, name: 'Red Course', code: 'RD303', present: 6, total: 15 };
      const { container } = render(<CourseCard course={redCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Red Course')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-red-500/);
    });
  });

  describe('Enabled/Disabled toggle', () => {
    it('shows "Enabled" toggle button by default', async () => {
      render(<CourseCard course={sampleCourse} />);
      expect(await screen.findByText('Enabled')).toBeInTheDocument();
    });

    it('shows "Disabled" when course is disabled', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (code: string) => code === 'CS101',
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      render(<CourseCard course={sampleCourse} />);
      expect(await screen.findByText('Disabled')).toBeInTheDocument();
    });

    it('opens disable dialog when clicking Enabled toggle', async () => {
      render(<CourseCard course={sampleCourse} />);
      const toggle = await screen.findByText('Enabled');
      fireEvent.click(toggle);
      expect(await screen.findByText(/Disable CS101/)).toBeInTheDocument();
    });

    it('opens enable dialog when clicking Disabled toggle', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (code: string) => code === 'CS101',
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      render(<CourseCard course={sampleCourse} />);
      const toggle = await screen.findByText('Disabled');
      fireEvent.click(toggle);
      expect(await screen.findByText(/Enable CS101/)).toBeInTheDocument();
      expect(await screen.findByText(/Challenge passed/)).toBeInTheDocument();
    });

    it('applies opacity to card when disabled', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (() => true) as (code: string) => boolean,
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      const { container } = render(<CourseCard course={sampleCourse} />);
      const card = container.querySelector('.custom-container');
      expect(card?.className).toContain('opacity-50');
    });

    it('calls disableCourse with courseCode and selected reason when Disable button is clicked', async () => {
      render(<CourseCard course={sampleCourse} />);
      // Open the disable dialog
      const toggle = await screen.findByText('Enabled');
      fireEvent.click(toggle);
      // Click the "Disable" confirm button
      const disableConfirmBtn = await screen.findByRole('button', { name: /^disable$/i });
      await act(async () => {
        fireEvent.click(disableConfirmBtn);
      });
      expect(mockDisableCourse).toHaveBeenCalledWith('CS101', 'Challenge passed');
    });

    it('calls enableCourse with courseCode when Enable button is clicked', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (code: string) => code === 'CS101',
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      render(<CourseCard course={sampleCourse} />);
      // Open the enable dialog
      const toggle = await screen.findByText('Disabled');
      fireEvent.click(toggle);
      // Click the "Enable" confirm button
      const enableConfirmBtn = await screen.findByRole('button', { name: /^enable$/i });
      await act(async () => {
        fireEvent.click(enableConfirmBtn);
      });
      expect(mockEnableCourse).toHaveBeenCalledWith('CS101');
    });

    it('does not show the toggle for a course without a code', async () => {
      const noCourseCode: ExtendedCourse = { id: 99, name: 'No Code Course' };
      render(<CourseCard course={noCourseCode} />);
      // Wait for component to render
      expect(await screen.findByText('No Code Course')).toBeInTheDocument();
      // Toggle button should be disabled (rendered but not interactive) when course.code is undefined
      const toggleBtn = screen.queryByRole('button', { name: /disable course/i });
      if (toggleBtn) {
        expect(toggleBtn).toBeDisabled();
      }
    });

    it('applies red bg/border override to CardHeader when course is disabled', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (() => true) as (code: string) => boolean,
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      const { container } = render(<CourseCard course={sampleCourse} />);
      await screen.findByText('Computer Science');
      // Select the CardHeader using its stable data-slot attribute inside the Card (.custom-container)
      const card = container.querySelector('.custom-container');
      const header = card?.querySelector('[data-slot="card-header"]');
      expect(header?.className).toContain('bg-red-500/10');
      expect(header?.className).toContain('border-red-500/30');
    });

    it('calls toast.success with courseCode and reason after confirming disable', async () => {
      render(<CourseCard course={sampleCourse} />);
      const toggle = await screen.findByText('Enabled');
      fireEvent.click(toggle);
      const disableConfirmBtn = await screen.findByRole('button', { name: /^disable$/i });
      fireEvent.click(disableConfirmBtn);
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('CS101 disabled', {
          description: 'Challenge passed',
        });
      });
    });

    it('calls toast.success with courseCode after confirming enable', async () => {
      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (code: string) => code === 'CS101',
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });
      render(<CourseCard course={sampleCourse} />);
      const toggle = await screen.findByText('Disabled');
      fireEvent.click(toggle);
      const enableConfirmBtn = await screen.findByRole('button', { name: /^enable$/i });
      fireEvent.click(enableConfirmBtn);
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('CS101 enabled');
      });
    });

    it('shows disabling state immediately and prevents duplicate disable submits while pending', async () => {
      const deferred = createDeferredPromise<void>();
      mockDisableCourse.mockReturnValueOnce(deferred.promise);

      render(<CourseCard course={sampleCourse} />);
      fireEvent.click(await screen.findByText('Enabled'));

      const disableConfirmBtn = await screen.findByRole('button', { name: /^disable$/i });
      fireEvent.click(disableConfirmBtn);

      const disablingBtn = await screen.findByRole('button', { name: /disabling\.\.\./i });
      expect(disablingBtn).toBeDisabled();

      fireEvent.click(disablingBtn);
      expect(mockDisableCourse).toHaveBeenCalledTimes(1);

      deferred.resolve();
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('CS101 disabled', {
          description: 'Challenge passed',
        });
      });
    });

    it('shows enabling state immediately and prevents duplicate enable submits while pending', async () => {
      const deferred = createDeferredPromise<void>();
      mockEnableCourse.mockReturnValueOnce(deferred.promise);

      mockUseDisabledCourses.mockReturnValue({
        isDisabled: (code: string) => code === 'CS101',
        getDisableReason: (() => 'Challenge passed') as (code: string) => string | null,
        disableCourse: mockDisableCourse,
        enableCourse: mockEnableCourse,
        disabledCodes: new Set(['CS101']),
        disabledCoursesMap: {},
        isLoading: false,
      });

      render(<CourseCard course={sampleCourse} />);
      fireEvent.click(await screen.findByText('Disabled'));

      const enableConfirmBtn = await screen.findByRole('button', { name: /^enable$/i });
      fireEvent.click(enableConfirmBtn);

      const enablingBtn = await screen.findByRole('button', { name: /enabling\.\.\./i });
      expect(enablingBtn).toBeDisabled();

      fireEvent.click(enablingBtn);
      expect(mockEnableCourse).toHaveBeenCalledTimes(1);

      deferred.resolve();
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('CS101 enabled');
      });
    });
  });

  describe('bunkCalcToggle event listener', () => {
    it('updates showBunkCalc state when bunkCalcToggle event is dispatched with false', async () => {
      vi.mocked(useCourseDetails).mockReturnValue({
        data: { present: 15, total: 20, absent: 5 },
        isLoading: false,
      } as unknown as ReturnType<typeof useCourseDetails>);
      render(<CourseCard course={sampleCourse} />);

      // Wait for component to finish loading and show bunk calc (default: true)
      expect(await screen.findByText('Computer Science')).toBeInTheDocument();

      // Dispatch a toggle event to turn off bunk calc
      fireEvent(
        window,
        new CustomEvent('bunkCalcToggle', { detail: false })
      );

      // Bunk calculator section should no longer be visible
      await expect(
        screen.queryByText(/You can safely bunk|You need to attend|You are on the edge/)
      ).not.toBeInTheDocument();
    });

    it('updates showBunkCalc state when bunkCalcToggle event is dispatched with true', async () => {
      vi.mocked(useCourseDetails).mockReturnValue({
        data: { present: 15, total: 20, absent: 5 },
        isLoading: false,
      } as unknown as ReturnType<typeof useCourseDetails>);
      vi.stubGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue('false'), // start hidden
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });
      render(<CourseCard course={sampleCourse} />);

      fireEvent(
        window,
        new CustomEvent('bunkCalcToggle', { detail: true })
      );

      // Bunk calculator should become visible
      expect(await screen.findByText('Computer Science')).toBeInTheDocument();
    });
  });

  describe('loadSetting with authenticated session', () => {
    it('loads bunk calc preference from user-scoped localStorage key when session has userId', async () => {
      const { createClient } = await import('@/lib/supabase/client');
      vi.mocked(createClient).mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: 'auth-user-abc' } } },
            error: null,
          }),
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      } as unknown as ReturnType<typeof createClient>);

      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => {
          if (key === 'showBunkCalc_auth-user-abc') return 'false';
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });

      vi.mocked(useCourseDetails).mockReturnValue({
        data: { present: 15, total: 20, absent: 5 },
        isLoading: false,
      } as unknown as ReturnType<typeof useCourseDetails>);

      render(<CourseCard course={sampleCourse} />);
      await screen.findByText('Computer Science');

      // The component should read the scoped key on mount
      await vi.waitFor(() => {
        expect(localStorage.getItem).toHaveBeenCalledWith('showBunkCalc_auth-user-abc');
      });
    });
  });
});
