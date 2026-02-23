/**
 * Tests for ScoresClient — covers:
 *  - Loading / error / empty states
 *  - Stats strip (total, scored, pending, avg %)
 *  - Course-grouped sections
 *  - Filter tabs (all / assessments / assignments) + counts
 *  - Visibility rules (assessments vs assignments)
 *  - Score display: resolvedScore > pivot.score, maxMark fallback
 *  - Ungraded submissions show "Pending" not "0 / max"
 *  - Drawer open / close via button and Esc
 *  - Accessibility roles + aria attributes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ScoresClient from '../ScoresClient'
import type { Exam, ExamAnswer, ExamQuestion } from '@/types'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading-spinner" />,
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
  // Note: useExamAnswers and useExamQuestions (drawer hooks) intentionally NOT set here.
  // Drawer tests set them up in their own beforeEach / per-test setup.
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScoresClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset body/html overflow after each test in case scroll lock leaked
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
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
      // One assessment, filter set to "assignment"
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

    it('shows — for avg score when no exam has both score and max mark', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant()] })
      setupDefault([exam], {}, {})
      render(<ScoresClient />)

      expect(screen.getByLabelText(/avg score: —/i)).toBeInTheDocument()
    })
  })

  // ── Score display ──────────────────────────────────────────────────────────

  describe('score display on card', () => {
    it('shows "Pending" when there is no score', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant(null)] })])
      render(<ScoresClient />)
      // The italic "Pending" span is the card's pending status (distinct from the stats tile label)
      expect(screen.getByText('Pending', { selector: 'span' })).toBeInTheDocument()
    })

    it('shows score + max mark from resolvedScore / resolvedMaxMark', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant(null)] })
      const answersMap = { 1: [makeAnswer(1, 100, '18.000')] }
      const questionsMap = { 1: [makeQuestion(100, '1', '25.0')] }
      setupDefault([exam], answersMap, questionsMap)
      render(<ScoresClient />)

      expect(screen.getByText('18')).toBeInTheDocument()
      expect(screen.getByText(/\/ 25/)).toBeInTheDocument()
    })

    it('shows "Pending" when answers exist but all scores are null (submitted, not graded)', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant(null)] })
      // answers present but score: null
      const answersMap = { 1: [makeAnswer(1, 100, null)] }
      const questionsMap = { 1: [makeQuestion(100, '1', '25.0')] }
      setupDefault([exam], answersMap, questionsMap)
      render(<ScoresClient />)

      // The italic span is the card's pending indicator; the stats tile has a div
      expect(screen.getByText('Pending', { selector: 'span' })).toBeInTheDocument()
      expect(screen.queryByText(/\/ 25/)).not.toBeInTheDocument()
    })
  })

  // ── Visibility rules ──────────────────────────────────────────────────────

  describe('visibility rules', () => {
    it('hides exams with no participants', () => {
      setupDefault([makeExam({ id: 1, name: 'Hidden Exam', participants: [] })])
      render(<ScoresClient />)
      expect(screen.queryByText('Hidden Exam')).not.toBeInTheDocument()
    })

    it('shows assessments with participants even without answers', () => {
      const exam = makeExam({ id: 1, name: 'Assessment', activity_type: 'assessment', participants: [makeParticipant()] })
      setupDefault([exam], { 1: [] }, {})
      render(<ScoresClient />)
      expect(screen.getByText('Assessment')).toBeInTheDocument()
    })

    it('hides assignments with no submitted answers', () => {
      const exam = makeExam({ id: 1, name: 'Hidden Assignment', activity_type: 'assignment', participants: [makeParticipant()] })
      setupDefault([exam], { 1: [] }, {})
      render(<ScoresClient />)
      expect(screen.queryByText('Hidden Assignment')).not.toBeInTheDocument()
    })

    it('shows assignments that have submitted answers', () => {
      const exam = makeExam({ id: 1, name: 'Submitted Assignment', activity_type: 'assignment', participants: [makeParticipant()] })
      const answersMap = { 1: [makeAnswer(1, 100, null)] } // submitted, not graded
      setupDefault([exam], answersMap, {})
      render(<ScoresClient />)
      expect(screen.getByText('Submitted Assignment')).toBeInTheDocument()
    })
  })

  // ── Course grouping ────────────────────────────────────────────────────────

  describe('course grouping', () => {
    it('renders a section header for each course', () => {
      const exam1 = makeExam({ id: 1, name: 'Exam A', course: [makeCourse(10, 'CS301', 'Data Structures') as any], participants: [makeParticipant()] })
      const exam2 = makeExam({ id: 2, name: 'Exam B', course: [makeCourse(20, 'CS302', 'Algorithms') as any], participants: [makeParticipant()] })
      setupDefault([exam1, exam2])
      render(<ScoresClient />)

      // Section header spans are the group labels; each course name also appears in each card
      // We check by specific span inside the section heading
      const cs301Headers = screen.getAllByText('CS301 – Data Structures')
      const cs302Headers = screen.getAllByText('CS302 – Algorithms')
      // At minimum one element per course (section header); duplicates from card rows are ok
      expect(cs301Headers.length).toBeGreaterThanOrEqual(1)
      expect(cs302Headers.length).toBeGreaterThanOrEqual(1)
    })

    it('groups both exams under same course section when they share a course', () => {
      const course = makeCourse(10, 'CS301', 'Data Structures')
      const exam1 = makeExam({ id: 1, name: 'Midterm', course: [course as any], participants: [makeParticipant()] })
      const exam2 = makeExam({ id: 2, name: 'Final', course: [course as any], participants: [makeParticipant()] })
      setupDefault([exam1, exam2])
      render(<ScoresClient />)

      // Section header: one span.font-semibold.text-white with the course name
      // Fallback: count elements that are direct section header spans (not inside card)
      const allMatches = screen.getAllByText('CS301 – Data Structures')
      // The course appears in: 1 section header + 2 card course rows = 3 total
      // But only 1 section header
      const sectionHeaderElements = allMatches.filter(el => el.tagName === 'SPAN' && el.className.includes('font-semibold'))
      expect(sectionHeaderElements).toHaveLength(1)

      // Both exams visible
      expect(screen.getByText('Midterm')).toBeInTheDocument()
      expect(screen.getByText('Final')).toBeInTheDocument()
    })

    it('shows count label with both type counts when mixed', () => {
      const course = makeCourse(10, 'CS301', 'Data Structures')
      const assessment = makeExam({ id: 1, activity_type: 'assessment', course: [course as any], participants: [makeParticipant()] })
      const assignment = makeExam({ id: 2, activity_type: 'assignment', course: [course as any], participants: [makeParticipant()] })
      const answersMap = { 1: [], 2: [makeAnswer(1, 100, '5.000')] }
      setupDefault([assessment, assignment], answersMap)
      render(<ScoresClient />)

      expect(screen.getByText(/1 assessment/i)).toBeInTheDocument()
      expect(screen.getByText(/1 assignment/i)).toBeInTheDocument()
    })
  })

  // ── Filter tabs ────────────────────────────────────────────────────────────

  describe('filter tabs', () => {
    it('shows only assessments when "Assessments" tab is clicked', () => {
      const assessment = makeExam({ id: 1, name: 'Quiz 1', activity_type: 'assessment', participants: [makeParticipant()] })
      const assignment = makeExam({ id: 2, name: 'Homework', activity_type: 'assignment', participants: [makeParticipant()] })
      const answersMap = { 1: [], 2: [makeAnswer(1, 100, '5.000')] }
      setupDefault([assessment, assignment], answersMap)
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /assessments/i }))

      expect(screen.getByText('Quiz 1')).toBeInTheDocument()
      expect(screen.queryByText('Homework')).not.toBeInTheDocument()
    })

    it('shows only assignments when "Assignments" tab is clicked', () => {
      const assessment = makeExam({ id: 1, name: 'Quiz 1', activity_type: 'assessment', participants: [makeParticipant()] })
      const assignment = makeExam({ id: 2, name: 'Homework', activity_type: 'assignment', participants: [makeParticipant()] })
      const answersMap = { 1: [], 2: [makeAnswer(1, 100, '5.000')] }
      setupDefault([assessment, assignment], answersMap)
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /assignments/i }))

      expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument()
      expect(screen.getByText('Homework')).toBeInTheDocument()
    })

    it('displays correct count badges on tabs', () => {
      const assessment = makeExam({ id: 1, activity_type: 'assessment', participants: [makeParticipant()] })
      const assignment = makeExam({ id: 2, activity_type: 'assignment', participants: [makeParticipant()] })
      const answersMap = { 1: [], 2: [makeAnswer(1, 100, '5.000')] }
      setupDefault([assessment, assignment], answersMap)
      render(<ScoresClient />)

      // All tab should show 2, others 1 each
      const buttons = screen.getAllByRole('button')
      const allTab = buttons.find((b) => b.textContent?.includes('All'))
      const assessTab = buttons.find((b) => b.textContent?.includes('Assessments'))
      const assignTab = buttons.find((b) => b.textContent?.includes('Assignments'))

      expect(allTab?.textContent).toMatch(/2/)
      expect(assessTab?.textContent).toMatch(/1/)
      expect(assignTab?.textContent).toMatch(/1/)
    })
  })

  // ── Drawer ─────────────────────────────────────────────────────────────────

  describe('detail drawer', () => {
    beforeEach(() => {
      // Set up drawer hooks to return data for exam id=1
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

    it('opens the drawer when a card is clicked', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('closes the drawer when close button is clicked', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /close details/i }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the drawer on Escape key', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows exam name and course in drawer header', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Midterm Exam')).toBeInTheDocument()
      expect(within(dialog).getByText(/CS301/)).toBeInTheDocument()
    })

    it('shows per-question breakdown when questions and answers are available', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))

      const dialog = screen.getByRole('dialog')
      // Text is uppercased via CSS; DOM text node is mixed-case
      expect(within(dialog).getByText((content) =>
        content.toLowerCase().includes('per-question breakdown')
      )).toBeInTheDocument()
      expect(within(dialog).getByText('Q1')).toBeInTheDocument()
    })

    it('shows "Pending marks" badge for ungraded exams', () => {
      mockUseExamAnswers.mockReturnValue({ data: [], isLoading: false, isError: false } as any)
      mockUseExamQuestions.mockReturnValue({ data: [makeQuestion(100, '1', '10.0')], isLoading: false, isError: false } as any)

      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/pending marks/i)).toBeInTheDocument()
    })

    it('locks body scroll when open and restores on close', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      expect(document.body.style.overflow).toBe('hidden')
      expect(document.documentElement.style.overflow).toBe('hidden')

      fireEvent.click(screen.getByRole('button', { name: /close details/i }))
      expect(document.body.style.overflow).not.toBe('hidden')
      expect(document.documentElement.style.overflow).not.toBe('hidden')
    })
  })

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('each exam card has an accessible button role and aria-label', () => {
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      expect(screen.getByRole('button', { name: /view details for midterm exam/i })).toBeInTheDocument()
    })

    it('drawer has role=dialog and aria-modal=true', () => {
      mockUseExamAnswers.mockReturnValue({ data: [], isLoading: false, isError: false } as any)
      mockUseExamQuestions.mockReturnValue({ data: [], isLoading: false, isError: false } as any)
      setupDefault([makeExam({ id: 1, participants: [makeParticipant()] })])
      render(<ScoresClient />)

      fireEvent.click(screen.getByRole('button', { name: /view details for midterm exam/i }))
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('refresh button has aria-label', () => {
      setupDefault([])
      render(<ScoresClient />)
      expect(screen.getByRole('button', { name: /refresh scores/i })).toBeInTheDocument()
    })

    it('progress bars have role=progressbar with aria-valuenow', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant()] })
      const answersMap = { 1: [makeAnswer(1, 100, '8.000')] }
      const questionsMap = { 1: [makeQuestion(100, '1', '10.0')] }
      setupDefault([exam], answersMap, questionsMap)
      render(<ScoresClient />)

      const progressBars = screen.getAllByRole('progressbar')
      expect(progressBars.length).toBeGreaterThan(0)
      expect(progressBars[0]).toHaveAttribute('aria-valuenow', '80')
    })

    it('stats tiles have aria-label', () => {
      const exam = makeExam({ id: 1, participants: [makeParticipant()] })
      setupDefault([exam])
      render(<ScoresClient />)

      expect(screen.getByLabelText(/total: 1/i)).toBeInTheDocument()
    })
  })
})
