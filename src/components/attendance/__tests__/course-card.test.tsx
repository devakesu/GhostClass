import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CourseCard, ExtendedCourse } from '../course-card';
import { useCourseDetails } from '@/hooks/courses/attendance';

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

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-circle-icon" />,
}));

const sampleCourse: ExtendedCourse = {
  id: 42,
  name: 'Computer Science',
  code: 'CS101',
  present: 15,
  total: 20,
};

describe('CourseCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it('applies no color border when there is no attendance data (isLoading)', async () => {
      vi.mocked(useCourseDetails).mockReturnValue({ data: undefined, isLoading: true } as any);
      const noDataCourse: ExtendedCourse = { id: 1, name: 'No Data Course', code: 'ND101' };
      const { container } = render(<CourseCard course={noDataCourse} />);
      // When hasAttendanceData is false, statusColorClasses.card is "" (no border-t class)
      const card = container.querySelector('.custom-container');
      expect(card?.className).not.toMatch(/border-t-green/);
      expect(card?.className).not.toMatch(/border-t-amber/);
      expect(card?.className).not.toMatch(/border-t-red/);
    });

    it('applies green top border when attendance is at or above target', async () => {
      // 15/20 = 75% = target
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 15, total: 20, absent: 5 }, isLoading: false } as any);
      const { container } = render(<CourseCard course={sampleCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Computer Science')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-green/);
    });

    it('applies amber top border when attendance is within 10% below target', async () => {
      // 10/15 ≈ 66.67%, target=75, target-10=65 → amber
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 10, total: 15, absent: 5 }, isLoading: false } as any);
      const amberCourse: ExtendedCourse = { id: 2, name: 'Amber Course', code: 'AM202', present: 10, total: 15 };
      const { container } = render(<CourseCard course={amberCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Amber Course')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-amber/);
    });

    it('applies red top border when attendance is more than 10% below target', async () => {
      // 6/15 = 40%, target=75, target-10=65 → red
      vi.mocked(useCourseDetails).mockReturnValue({ data: { present: 6, total: 15, absent: 9 }, isLoading: false } as any);
      const redCourse: ExtendedCourse = { id: 3, name: 'Red Course', code: 'RD303', present: 6, total: 15 };
      const { container } = render(<CourseCard course={redCourse} />);
      const card = container.querySelector('.custom-container');
      expect(await within(card as HTMLElement).findByText('Red Course')).toBeInTheDocument();
      expect(card?.className).toMatch(/border-t-red/);
    });
  });
});
