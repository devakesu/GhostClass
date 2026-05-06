import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ScoresClient from '../ScoresClient';
import { useExams, useAllExamAnswers, useAllExamQuestions } from '@/hooks/courses/exams';
import { useFetchSemester, useFetchAcademicYear } from '@/hooks/users/settings';
import { useDisabledCourses } from '@/hooks/courses/useDisabledCourses';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/scores'),
}));

vi.mock('@/hooks/courses/exams', () => ({
  useExams: vi.fn(),
  useAllExamAnswers: vi.fn(),
  useAllExamQuestions: vi.fn(),
  useExamAnswers: vi.fn(),
  useExamQuestions: vi.fn(),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: vi.fn(),
  useFetchAcademicYear: vi.fn(),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    main: ({ children, ...props }: any) => <main {...props}>{children}</main>,
  },
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

describe('ScoresClient', () => {
  const mockExams = [
    {
      id: 1,
      name: 'Test Exam',
      activity_type: 'assessment',
      course: [{ id: 101, name: 'Test Course', code: 'TC101' }],
      participants: [{ pivot: { score: 85 } }],
      maximum_mark: 100,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useExams).mockReturnValue({ data: mockExams, isLoading: false } as any);
    vi.mocked(useAllExamAnswers).mockReturnValue([{ data: [], isPending: false }] as any);
    vi.mocked(useAllExamQuestions).mockReturnValue([{ data: [], isPending: false }] as any);
    vi.mocked(useFetchSemester).mockReturnValue({ data: 'even' } as any);
    vi.mocked(useFetchAcademicYear).mockReturnValue({ data: '2024' } as any);
    vi.mocked(useDisabledCourses).mockReturnValue({ isDisabled: () => false } as any);
  });

  it('renders loading state when exams are loading', () => {
    vi.mocked(useExams).mockReturnValue({ data: null, isLoading: true } as any);
    render(<ScoresClient />);
    expect(screen.getByTestId('loading')).toBeDefined();
  });

  it('renders exams correctly', () => {
    render(<ScoresClient />);
    expect(screen.getByText('Test Exam')).toBeDefined();
    expect(screen.getAllByText(/TC101/)[0]).toBeDefined();
    expect(screen.getByText('85')).toBeDefined();
  });

  it('filters exams by activity type', async () => {
    render(<ScoresClient />);
    expect(screen.getByText('Test Exam')).toBeDefined();
    
    fireEvent.click(screen.getByText('Assignments'));
    expect(screen.queryByText('Test Exam')).toBeNull();
  });

  it('opens drawer when an exam is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn() } as any);
    
    render(<ScoresClient />);
    fireEvent.click(screen.getByText('Test Exam'));
    
    expect(push).toHaveBeenCalledWith('/scores?panel=1', expect.any(Object));
  });
});
