/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseGrid } from '../CourseGrid';

type MockComponentProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

type MockCourseCardProps = {
  course: { code?: string; id: number };
};

vi.mock('@/components/attendance/course-card', () => ({
  CourseCard: ({ course }: MockCourseCardProps) => <div data-testid="course-card">{course.code || course.id}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('framer-motion', () => {
  const mockComponent = ({ children, ...rest }: MockComponentProps) => {
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
    AnimatePresence: ({ children }: MockComponentProps) => <>{children}</>,
    LazyMotion: ({ children }: MockComponentProps) => <>{children}</>,
    domAnimation: {},
  };
});

describe('CourseGrid', () => {
  const mockProps = {
    isLoadingCourses: false,
    isLoadingAllCourseSummaries: false,
    sortedCourses: [
      { id: 1, name: 'Computer Science 1', code: 'CS101', key: '1', institution_users: [] },
      { id: 2, name: 'Computer Science 2', code: 'CS102', key: '2', institution_users: [] },
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
