/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock everything before importing the component
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/scores'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/hooks/courses/exams', () => ({
  useExams: vi.fn(() => ({ data: [], isLoading: false })),
  useAllExamAnswers: vi.fn(() => ({ data: [], isLoading: false })),
  useAllExamQuestions: vi.fn(() => ({ data: [], isLoading: false })),
  useExamAnswers: vi.fn(() => ({ data: [], isLoading: false })),
  useExamQuestions: vi.fn(() => ({ data: [], isLoading: false })),
  useBatchExamDetails: vi.fn(() => ({ 
    isPending: false, 
    data: { examDetails: {}, studentAnswers: {} } 
  })),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: vi.fn(() => ({ data: 'odd' })),
  useFetchAcademicYear: vi.fn(() => ({ data: '2024-25' })),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    isDisabled: vi.fn(() => false),
    isLoading: false,
  })),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

vi.mock('lucide-react', () => ({
  GraduationCap: () => <div data-testid="icon-graduation-cap" />,
  FileText: () => <div data-testid="icon-file-text" />,
  Clock: () => <div data-testid="icon-clock" />,
  BookOpen: () => <div data-testid="icon-book-open" />,
  AlertCircle: () => <div data-testid="icon-alert-circle" />,
  RefreshCw: () => <div data-testid="icon-refresh-cw" />,
  X: () => <div data-testid="icon-x" />,
  ChevronRight: () => <div data-testid="icon-chevron-right" />,
  HelpCircle: () => <div data-testid="icon-help-circle" />,
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

import ScoresClient from '../ScoresClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as examsHooks from '@/hooks/courses/exams';
import * as navigation from 'next/navigation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('ScoresClient', () => {
  const mockExams = [
    {
      id: 1,
      name: 'Midterm Exam',
      activity_type: 'assessment',
      course: [{ id: 101, code: 'CS101', name: 'Computer Science' }],
      participants: [{ pivot: { score: 85 } }],
      maximum_mark: 100,
    },
    {
      id: 2,
      name: 'Final Project',
      activity_type: 'assignment',
      course: [{ id: 102, code: 'CS102', name: 'Data Structures' }],
      participants: [{ pivot: { score: null } }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    vi.mocked(examsHooks.useExams).mockReturnValue({ isLoading: true } as any);
    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders error state', () => {
    vi.mocked(examsHooks.useExams).mockReturnValue({ isError: true } as any);
    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );
    expect(screen.getByText(/Failed to load scores/i)).toBeInTheDocument();
  });

  it('renders exams and allows filtering', async () => {
    vi.mocked(examsHooks.useExams).mockReturnValue({ data: mockExams, isLoading: false } as any);
    vi.mocked(examsHooks.useBatchExamDetails).mockReturnValue({ 
      isPending: false, 
      data: { 
        1: { answers: [], questions: [] },
        2: { answers: [{ id: 100 }], questions: [] }
      } 
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );

    expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    expect(screen.getByText('Final Project')).toBeInTheDocument();

    // Filter by Assessment
    const assessmentTab = screen.getByRole('button', { name: /Assessments/i });
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.click(assessmentTab);

    expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    expect(screen.queryByText('Final Project')).not.toBeInTheDocument();
  });

  it('refetches exams when refresh button is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(examsHooks.useExams).mockReturnValue({ data: mockExams, isLoading: false, refetch } as any);
    
    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );

    const refreshButton = screen.getByLabelText(/Refresh scores/i);
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.click(refreshButton);

    expect(refetch).toHaveBeenCalled();
  });

  it('opens detail drawer when an exam card is clicked', async () => {
    vi.mocked(examsHooks.useExams).mockReturnValue({ data: mockExams, isLoading: false } as any);
    vi.mocked(examsHooks.useExamQuestions).mockReturnValue({ data: [{ id: 1, question_no: '1', maximum_mark: 10 }], isLoading: false } as any);
    const push = vi.fn();
    vi.mocked(navigation.useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn() } as any);
    
    // Simulate panel in URL
    vi.mocked(navigation.useSearchParams).mockReturnValue(new URLSearchParams('panel=1') as any);

    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );

    // Should render ExamDetailDrawer (mocked as part of ScoresClient or its dependencies)
    // Since we mock useSearchParams to have panel=1, it should show the drawer for exam 1
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Per-question breakdown|Question paper/i)).toBeInTheDocument();
  });

  it('calculates resolved scores correctly from batch data', () => {
    const batchData = {
      1: {
        answers: [
          { id: 1, examquestion_id: 10, score: 5 },
          { id: 2, examquestion_id: 11, score: 10 },
        ],
        questions: [
          { id: 10, question_no: '1', maximum_mark: 10 },
          { id: 11, question_no: '2', maximum_mark: 10 },
        ]
      }
    };
    vi.mocked(examsHooks.useExams).mockReturnValue({ data: mockExams, isLoading: false } as any);
    vi.mocked(examsHooks.useBatchExamDetails).mockReturnValue({ 
      isPending: false, 
      data: batchData 
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <ScoresClient />
      </QueryClientProvider>
    );

    // Exam 1 should show score 15 (5+10)
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/\/ 100|\/ 20/)).toBeInTheDocument();
  });
});
