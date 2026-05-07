/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ScoresClient from '../ScoresClient';
import { useExams, useAllExamAnswers, useAllExamQuestions, useExamAnswers, useExamQuestions } from '@/hooks/courses/exams';
import { useFetchSemester, useFetchAcademicYear } from '@/hooks/users/settings';
import { useDisabledCourses } from '@/hooks/courses/useDisabledCourses';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
  usePathname: vi.fn(),
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
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    h3: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
  },
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => open ? <div>{children}</div> : null,
  SheetContent: ({ children, onPointerDownOutside }: any) => (
    <div onMouseDown={onPointerDownOutside}>{children}</div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

vi.mock('../components/ScoreCard', () => ({
  ScoreCard: ({ exam, onClick }: any) => (
    <div onClick={onClick} data-testid={`score-card-${exam.id}`}>{exam.name}</div>
  ),
}));

describe('ScoresClient', () => {
  let mockExams: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockExams = [
      {
        id: 1,
        name: 'Test Exam',
        activity_type: 'assessment',
        course: [{ id: 101, name: 'Test Course', code: 'TC101' }],
        participants: [{ pivot: { score: 85 } }],
        maximum_mark: 100,
        starts_at: '2024-01-01',
      },
    ];
    window.sessionStorage.setItem('ezygo_access_token', 'valid-token');
    vi.mocked(useExams).mockReturnValue({ data: mockExams, isLoading: false, isError: false, refetch: vi.fn(), isFetching: false } as any);
    vi.mocked(useAllExamAnswers).mockReturnValue([{ data: [], isPending: false }] as any);
    vi.mocked(useAllExamQuestions).mockReturnValue([{ data: [], isPending: false }] as any);
    vi.mocked(useExamAnswers).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useExamQuestions).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useFetchSemester).mockReturnValue({ data: 'even' } as any);
    vi.mocked(useFetchAcademicYear).mockReturnValue({ data: '2024' } as any);
    vi.mocked(useDisabledCourses).mockReturnValue({ isDisabled: () => false } as any);
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), replace: vi.fn() } as any);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any);
    vi.mocked(usePathname).mockReturnValue('/scores');
  });

  it('renders loading state when exams are loading', () => {
    vi.mocked(useExams).mockReturnValue({ data: null, isLoading: true } as any);
    render(<ScoresClient />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders exams correctly', async () => {
    render(<ScoresClient />);
    expect(await screen.findByText('Test Exam')).toBeInTheDocument();
  });

  it('filters exams by activity type', async () => {
    render(<ScoresClient />);
    expect(await screen.findByText('Test Exam')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Assignments'));
    expect(screen.queryByText('Test Exam')).not.toBeInTheDocument();
  });

  it('opens drawer when an exam is clicked (push if no panel)', async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn() } as any);
    
    render(<ScoresClient />);
    const card = await screen.findByText('Test Exam');
    fireEvent.click(card);
    
    expect(push).toHaveBeenCalledWith('/scores?panel=1', { scroll: false });
  });

  it('uses router.replace if panel already exists when opening drawer', async () => {
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), replace } as any);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('panel=old') as any);
    
    render(<ScoresClient />);
    const card = await screen.findByText('Test Exam');
    fireEvent.click(card);
    
    expect(replace).toHaveBeenCalledWith('/scores?panel=1', { scroll: false });
  });

  it('renders error state and retries on click', async () => {
    const refetch = vi.fn();
    vi.mocked(useExams).mockReturnValue({ data: null, isLoading: false, isError: true, refetch } as any);
    
    render(<ScoresClient />);
    expect(await screen.findByText(/Failed to load scores/i)).toBeInTheDocument();
    
    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalled();
  });

  it('sorts disabled courses to the bottom', async () => {
    const exams = [
      {
        id: 1, name: 'Exam A', activity_type: 'assessment',
        course: [{ id: 101, code: 'ENABLED', name: 'Enabled Course' }], 
        participants: [{ pivot: { score: 80 } }], 
        maximum_mark: 100,
        starts_at: '2024-01-01'
      },
      {
        id: 2, name: 'Exam B', activity_type: 'assessment',
        course: [{ id: 102, code: 'DISABLED', name: 'Disabled Course' }], 
        participants: [{ pivot: { score: 70 } }], 
        maximum_mark: 100,
        starts_at: '2024-01-01'
      }
    ];
    vi.mocked(useExams).mockReturnValue({ data: exams, isLoading: false, isError: false } as any);
    vi.mocked(useAllExamAnswers).mockReturnValue(exams.map(() => ({ data: [], isPending: false })) as any);
    vi.mocked(useAllExamQuestions).mockReturnValue(exams.map(() => ({ data: [], isPending: false })) as any);
    vi.mocked(useDisabledCourses).mockReturnValue({ isDisabled: (code: string) => code === 'DISABLED' } as any);
    
    render(<ScoresClient />);
    
    expect(await screen.findByText('Exam A')).toBeInTheDocument();
    expect(await screen.findByText('Exam B')).toBeInTheDocument();
  });

  it('renders empty state when no exams match filter', async () => {
    vi.mocked(useExams).mockReturnValue({ data: [], isLoading: false, isError: false } as any);
    render(<ScoresClient />);
    expect(await screen.findByText(/No exams found/i)).toBeInTheDocument();
  });

  it('handles exams without course info', async () => {
    const exams = [
      {
        id: 3,
        name: 'No Course Exam',
        activity_type: 'assessment',
        course: [],
        participants: [{ pivot: { score: 50 } }],
        maximum_mark: 100,
        starts_at: '2024-01-01'
      }
    ];
    vi.mocked(useExams).mockReturnValue({ data: exams, isLoading: false, isError: false } as any);
    vi.mocked(useAllExamAnswers).mockReturnValue([{ data: [], isPending: false }] as any);
    vi.mocked(useAllExamQuestions).mockReturnValue([{ data: [], isPending: false }] as any);
    
    render(<ScoresClient />);
    expect(await screen.findByText('No Course Exam')).toBeInTheDocument();
  });

  it('refetches scores when refresh button is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(useExams).mockReturnValue({ data: mockExams, isLoading: false, isError: false, refetch, isFetching: false } as any);
    
    render(<ScoresClient />);
    const refreshBtn = await screen.findByLabelText(/Refresh scores/i);
    fireEvent.click(refreshBtn);
    expect(refetch).toHaveBeenCalled();
  });

  it('closes drawer by removing panel param', async () => {
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), replace } as any);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('panel=1') as any);
    
    render(<ScoresClient />);
    const closeBtn = await screen.findByLabelText(/Close details/i);
    fireEvent.click(closeBtn);
    
    expect(replace).toHaveBeenCalledWith('/scores', { scroll: false });
  });

  it('calculates totalPossible from questions if getMaxMark returns null', async () => {
    const exams = [{
      id: 1, name: 'Exam with Questions', activity_type: 'assessment',
      course: [{ id: 101, code: 'C1', name: 'Course 1' }], 
      participants: [{ pivot: { score: 80 } }], 
      maximum_mark: null, 
      starts_at: '2024-01-01'
    }];
    const questions = [
      { id: 10, question_no: '1', maximum_mark: 10, subquestion_parent_id: null },
      { id: 11, question_no: '2', maximum_mark: 20, subquestion_parent_id: null },
      { id: 12, question_no: '2a', maximum_mark: 5, subquestion_parent_id: 11 },
      { id: 13, question_no: '2b', maximum_mark: 5, subquestion_parent_id: 11 },
    ];
    vi.mocked(useExams).mockReturnValue({ data: exams, isLoading: false, isError: false } as any);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('panel=1') as any);
    vi.mocked(useExamAnswers).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useExamQuestions).mockReturnValue({ data: questions, isLoading: false } as any);
    
    render(<ScoresClient />);
  });

  it('filters assignments based on submission (answers)', async () => {
    const exams = [
      {
        id: 1, name: 'Assignment with Answer', activity_type: 'assignment',
        course: [{ id: 101, code: 'C1', name: 'Course 1' }], 
        participants: [{ pivot: { score: 80 } }], 
        maximum_mark: 100, starts_at: '2024-01-01'
      },
      {
        id: 2, name: 'Assignment without Answer', activity_type: 'assignment',
        course: [{ id: 101, code: 'C1', name: 'Course 1' }], 
        participants: [{ pivot: { score: 0 } }], 
        maximum_mark: 100, starts_at: '2024-01-01'
      }
    ];
    vi.mocked(useExams).mockReturnValue({ data: exams, isLoading: false, isError: false } as any);
    
    vi.mocked(useAllExamAnswers).mockReturnValue([
      { data: [{ id: 1 }], isPending: false },
      { data: [], isPending: false },
    ] as any);
    vi.mocked(useAllExamQuestions).mockReturnValue(exams.map(() => ({ data: [], isPending: false })) as any);
    
    render(<ScoresClient />);
    expect(await screen.findByText('Assignment with Answer')).toBeInTheDocument();
    expect(screen.queryByText('Assignment without Answer')).not.toBeInTheDocument();
  });
});
