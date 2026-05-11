/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseGrid } from '../CourseGrid';

vi.mock('@/components/attendance/course-card', () => ({
  CourseCard: ({ course }: any) => <div data-testid="course-card">{course.code || course.id}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('framer-motion', () => {
  const mockComponent = ({ children, ...props }: any) => {
    const { initial: _i, animate: _a, transition: _t, whileHover: _wh, whileTap: _wt, exit: _e, ...rest } = props;
    return <div {...rest}>{children}</div>;
  };
  return {
    motion: {
      div: mockComponent,
      button: mockComponent,
      h3: mockComponent,
      p: mockComponent,
    },
    m: {
      div: mockComponent,
      button: mockComponent,
      h3: mockComponent,
      p: mockComponent,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
    LazyMotion: ({ children }: any) => <>{children}</>,
    domAnimation: {},
  };
});

describe('CourseGrid', () => {
  const mockProps = {
    isLoadingCourses: false,
    isLoadingAllCourseSummaries: false,
    sortedCourses: [
      { id: 1, code: 'CS101', key: '1', institution_users: [] },
      { id: 2, code: 'CS102', key: '2', institution_users: [] },
    ],
    customInstructors: [],
    allCourseSummaries: {},
    profile: { auth_id: 'test-auth-id' },
    onEditInstructor: vi.fn(),
    onAddCourse: vi.fn(),
  };

  it('renders loading state', () => {
    render(<CourseGrid {...mockProps} isLoadingCourses={true} />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
  });

  it('renders courses', () => {
    render(<CourseGrid {...mockProps} />);
    expect(screen.getByText('CS101')).toBeInTheDocument();
    expect(screen.getByText('CS102')).toBeInTheDocument();
    expect(screen.getByText(/Can't find a course\?/i)).toBeInTheDocument();
  });

  it('renders empty state when no courses', () => {
    render(<CourseGrid {...mockProps} sortedCourses={[]} />);
    expect(screen.getByText(/No courses found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Your First Course/i })).toBeInTheDocument();
  });

  it('calls onAddCourse when add button is clicked', async () => {
    render(<CourseGrid {...mockProps} sortedCourses={[]} />);
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.click(screen.getByRole('button', { name: /Add Your First Course/i }));
    expect(mockProps.onAddCourse).toHaveBeenCalled();
  });
});
