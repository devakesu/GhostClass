import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ScoresClient from '../ScoresClient'
import type { Exam, ExamAnswer, ExamQuestion } from '@/types'


// ─── Mocks ───────────────────────────────────────────────────────────────────

// Global state for next/navigation mock to allow reactivity in tests
let currentSearchParams = new URLSearchParams();
const navListeners = new Set<(p: URLSearchParams) => void>();

const mockPush = vi.fn((url: string) => {
  const [_, search] = url.split('?');
  currentSearchParams = new URLSearchParams(search || '');
  // Notify all active useSearchParams hooks synchronously
  navListeners.forEach(l => l(currentSearchParams));
});

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockPush,
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),

    usePathname: () => '/scores',
    useSearchParams: () => {
      const [params, setParams] = React.useState(() => currentSearchParams);
      React.useEffect(() => {
        const handler = (p: URLSearchParams) => {
          setParams(new URLSearchParams(p.toString()));
        };
        navListeners.add(handler);
        return () => { navListeners.delete(handler); };
      }, []);
      return params;
    },
    useParams: () => ({}),
  };
});







// Local mock removed to use global one from vitest.setup.ts
/*
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
*/

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading-spinner" />,
}))

const MOCK_SEM_VAL = { data: 'even', isLoading: false };
const MOCK_YEAR_VAL = { data: '2025-2026', isLoading: false };
vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: vi.fn(() => MOCK_SEM_VAL),
  useFetchAcademicYear: vi.fn(() => MOCK_YEAR_VAL),
}))

const MOCK_DISABLED_MAP = {};
const MOCK_DISABLED_CODES = new Set<string>();
vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    disabledCoursesMap: MOCK_DISABLED_MAP,
    disabledCodes: MOCK_DISABLED_CODES,
    isDisabled: vi.fn(() => false),
    getDisableReason: vi.fn(() => null),
    disableCourse: vi.fn(),
    enableCourse: vi.fn(),
    isLoading: false,
  })),
}))

vi.mock('@/hooks/courses/exams', () => ({
  useExams: vi.fn(),
  useAllExamAnswers: vi.fn(),
  useAllExamQuestions: vi.fn(),
  useExamAnswers: vi.fn(),
  useExamQuestions: vi.fn(),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeCourse = (id = 10, code = 'CS301', name = 'Data Structures') => ({
  id,
  si_no: 1,
  name,
  code,
  department_course_code: null,
  start_year: null,
  end_year: null,
  institution_id: 1,
  usersubgroup_id: 1,
  created_by: 1,
  created_at: '',
  updated_at: '',
  academic_year: '2026',
  academic_semester: '6',
  pre_requisites: null,
  ltp_credits: null,
  reference_docs: null,
  text_books: null,
  course_type_id: 1,
  course_category_id: null,
  deleted_at: null,
  enable_laboratory: null,
  pivot: { exam_id: 1, course_id: id },
  usersubgroup: { id: 1, si_no: '1', name: 'CS', description: null, code: 'CS', scheme: 'A', type: null, end_date: '', start_date: '', start_year: '', end_year: '', usergroup_id: 1, programme_config_group_id: 1, institution_id: 1, created_by: 1, deleted_at: null, created_at: '', updated_at: '', academic_year: '', academic_semester: '', usergroup: { id: 1, name: 'UG', description: null, code: 'UG', affiliated_university: '', scheme: 'A' } },
  usergroup: { id: 1, name: 'UG', description: null, code: 'UG', affiliated_university: '', scheme: 'A' }
})

const makeParticipant = (score: number | null = null) => ({
  id: 1,
  starts_at: null,
  end_at: null,
  exam_id: 1,
  pivot: { exam_id: 1, institution_user_id: 1, starts_at: null, end_at: null, score, comments: null, absent_enable: 0 },
})

const makeExam = (overrides: Partial<Exam> = {}): Exam => ({
  id: 1,
  name: 'Midterm Exam',
  activity_type: 'assessment',
  summary: null,
  starts_at: '2026-01-15T10:00:00.000Z',
  end_at: null,
  return_at: null,
  limitted_time_seconds: null,
  category_id: null,
  respond_after_close: 0,
  offline_activity: 0,
  maximum_mark: null,
  negative_mark: null,
  positive_mark: null,
  hidden: 0,
  is_objective_only: 0,
  shuffle_questions: 0,
  shuffle_choices: 0,
  exclude_from_report: 0,
  ordered_choice_list: 0,
  auto_evaluation: 0,
  publish_result: 0,
  max_co_scores: null,
  co_score_evaluation: 0,
  institution_id: 1,
  settings: null,
  course_id: 10,
  created_by: 1,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  course: [makeCourse() as any],
  activity_name: null,
  activity_name_id: null,
  participants: [makeParticipant()],
  ...overrides,
})

const makeAnswer = (id: number, questionId: number, score: string | null = '5.000'): ExamAnswer => ({
  id,
  answer: null,
  score,
  choice_id: null,
  examquestion_id: questionId,
  student_id: 1,
  created_by: 1,
  created_at: '',
  updated_at: '',
  files: [],
})

const makeQuestion = (id: number, no: string, maxMark: string): ExamQuestion => ({
  id,
  question_no: no,
  name: `Q${no}`,
  question: [],
  summary: null,
  difficulty_level: null,
  type: 'Theory',
  evaluation_scheme: null,
  allow_descriptive: 1,
  allow_attachment_answer: 0,
  answer_required: 1,
  maximum_mark: maxMark,
  blooms_taxonamy_level: null,
  section_id: null,
  module_id: 1,
  exam_id: 1,
  institution_id: 1,
  created_by: 1,
  created_at: '',
  updated_at: '',
  orquestion_group_id: null,
  subquestion_parent_id: null,
  files: [],
  choices: [],
  course_outcome: [],
  programme_outcome: [],
  programme_specific_outcome: [],
})

// ─── Helper: set up hook returns ─────────────────────────────────────────────

import {
  useExams,
  useAllExamAnswers,
  useAllExamQuestions,
  useExamAnswers,
  useExamQuestions,
} from '@/hooks/courses/exams'

const mockUseExams = vi.mocked(useExams)
const mockUseAllExamAnswers = vi.mocked(useAllExamAnswers)
const mockUseAllExamQuestions = vi.mocked(useAllExamQuestions)
const mockUseExamAnswers = vi.mocked(useExamAnswers)
const mockUseExamQuestions = vi.mocked(useExamQuestions)

/** Default: no data loaded, nothing pending */
function setupDefault(exams: Exam[], answersMap: Record<number, ExamAnswer[]> = {}, questionsMap: Record<number, ExamQuestion[]> = {}) {
  mockUseExams.mockReturnValue({
    data: exams,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue({}),
    isFetching: false,
  } as any)

  const examIds = exams.filter((e) => e.participants.length > 0).map((e) => e.id)

  mockUseAllExamAnswers.mockReturnValue(
    examIds.map((id) => ({
      data: answersMap[id] ?? [],
      isPending: false,
      isError: false,
      isSuccess: true,
    })) as any
  )

  mockUseAllExamQuestions.mockReturnValue(
    examIds.map((id) => ({
      data: questionsMap[id] ?? [],
      isPending: false,
      isError: false,
      isSuccess: true,
    })) as any
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScoresClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset body/html overflow after each test in case scroll lock leaked
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    // Clear search params
    currentSearchParams = new URLSearchParams();
    navListeners.clear();
  })






  afterEach(() => {
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading spinner while exams are fetching', () => {
      mockUseExams.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn(), isFetching: true } as any)
      mockUseAllExamAnswers.mockReturnValue([] as any)
      mockUseAllExamQuestions.mockReturnValue([] as any)

      render(<ScoresClient />)
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })

    it('shows loading spinner while answer queries are pending', () => {
      mockUseExams.mockReturnValue({ data: [makeExam({ participants: [makeParticipant()] })], isLoading: false, isError: false, refetch: vi.fn(), isFetching: false } as any)
      mockUseAllExamAnswers.mockReturnValue([{ data: undefined, isPending: true }] as any)
      mockUseAllExamQuestions.mockReturnValue([{ data: undefined, isPending: false }] as any)

      render(<ScoresClient />)
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })
  })

  // ── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error message when exams fetch fails', () => {
      mockUseExams.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn(), isFetching: false } as any)
      mockUseAllExamAnswers.mockReturnValue([] as any)
      mockUseAllExamQuestions.mockReturnValue([] as any)

      render(<ScoresClient />)
      expect(screen.getByText(/failed to load scores/i)).toBeInTheDocument()
    })

    it('renders a Retry button that calls refetch', () => {
      const refetch = vi.fn().mockResolvedValue({})
      mockUseExams.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch, isFetching: false } as any)
      mockUseAllExamAnswers.mockReturnValue([] as any)
      mockUseAllExamQuestions.mockReturnValue([] as any)

      render(<ScoresClient />)
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(refetch).toHaveBeenCalledTimes(1)
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when there are no participated exams', () => {
      setupDefault([makeExam({ participants: [] })])
      render(<ScoresClient />)
      expect(screen.getByText(/no exams found/i)).toBeInTheDocument()
    })

    it('shows empty state when active filter has no matches', () => {
      setupDefault([makeExam({ id: 1, activity_type: 'assessment', participants: [makeParticipant()] })])
      render(<ScoresClient />)
      fireEvent.click(screen.getByRole('button', { name: /assignments/i }))
      expect(screen.getByText(/no assignments found/i)).toBeInTheDocument()
    })
  })

  // ── Stats strip ───────────────────────────────────────────────────────────

  describe('stats strip', () => {
    it('renders total / scored / pending counts', () => {
      const exams = [
        makeExam({ id: 1, participants: [makeParticipant()] }),   // pending
        makeExam({ id: 2, name: 'Final', participants: [makeParticipant()] }), // pending
      ]
      const answersMap = {
        1: [makeAnswer(1, 100, '8.000')], // graded → scored
        2: [],                             // no answers → pending
      }
      const questionsMap = {
        1: [makeQuestion(100, '1', '10.0')],
        2: [],
      }
      setupDefault(exams, answersMap, questionsMap)
      render(<ScoresClient />)

      expect(screen.getByLabelText(/total: 2/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/scored: 1/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/pending: 1/i)).toBeInTheDocument()
    })

    it('shows avg score percentage when calculable', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant()] })
      const answersMap = { 1: [makeAnswer(1, 100, '8.000')] }
      const questionsMap = { 1: [makeQuestion(100, '1', '10.0')] }
      setupDefault([exam], answersMap, questionsMap)
      render(<ScoresClient />)

      // 8/10 = 80%
      expect(screen.getByLabelText(/avg score: 80%/i)).toBeInTheDocument()
    })
  })

  // ── Detail drawer ──────────────────────────────────────────────────────────

  describe('detail drawer', () => {
    beforeEach(() => {
      mockUseExamAnswers.mockReturnValue({
        data: [makeAnswer(1, 100, '8.000')],
        isLoading: false,
        isError: false,
      } as any)
      mockUseExamQuestions.mockReturnValue({
        data: [makeQuestion(100, '1', '10.0')],
        isLoading: false,
        isError: false,
      } as any)
    })

    it('opens the drawer when a card is clicked', async () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()

    })

    it('closes the drawer when close button is clicked', async () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /close details/i }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      }, { timeout: 2000 })


    })

    it('locks body scroll when drawer is open and restores on close', async () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden')
        expect(document.documentElement.style.overflow).toBe('hidden')
      })

      fireEvent.click(screen.getByRole('button', { name: /close details/i }))
      await waitFor(() => {
        expect(document.body.style.overflow).toBe('')
        expect(document.documentElement.style.overflow).toBe('')
      }, { timeout: 2000 })


    })
  })
})
