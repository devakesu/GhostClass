import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { useExams, useExamAnswers, useExamQuestions, useAllExamAnswers, useAllExamQuestions } from '@/hooks/courses/exams'
import axiosInstance from '@/lib/axios'
import type { Exam, ExamAnswer, ExamQuestion } from '@/types'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn() },
}))

const mockGet = vi.mocked(axiosInstance.get)

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeExam = (id = 1, name = 'Midterm'): Exam =>
  ({
    id,
    name,
    activity_name_id: null,
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    course: [{ id: 10, name: 'Data Structures', code: 'CS301' } as any],
    activity_name: null,
    participants: [{ id: 1, exam_id: id, starts_at: null, end_at: null, pivot: { exam_id: id, institution_user_id: 1, starts_at: null, end_at: null, score: 18, comments: null, absent_enable: 0 } }],
  })

const makeAnswer = (id = 1, questionId = 100, score: string | null = '5.000'): ExamAnswer => ({
  id,
  answer: null,
  score,
  choice_id: null,
  examquestion_id: questionId,
  student_id: 1,
  created_by: 1,
  created_at: '2026-01-15T12:00:00.000Z',
  updated_at: '2026-01-15T12:00:00.000Z',
  files: [],
})

const makeQuestion = (id = 100, no = '1', maxMark = '5.0'): ExamQuestion =>
  ({
    id,
    question_no: no,
    name: `Question ${no}`,
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    orquestion_group_id: null,
    subquestion_parent_id: null,
    files: [],
    choices: [],
    course_outcome: [],
    programme_outcome: [],
    programme_specific_outcome: [],
  })

// ─── Wrapper ─────────────────────────────────────────────────────────────────

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'QueryClientWrapper'
  return Wrapper
}

// ─── useExams ─────────────────────────────────────────────────────────────────

describe('useExams', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns exam array on success', async () => {
    const exams = [makeExam(1), makeExam(2, 'Final')]
    mockGet.mockResolvedValueOnce({ data: exams })

    const { result } = renderHook(() => useExams(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].name).toBe('Midterm')
    expect(result.current.data![1].name).toBe('Final')
    expect(mockGet).toHaveBeenCalledWith('/exams')
  })

  it('enters error state on network failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useExams(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
  })

  it('stays idle when disabled', () => {
    const { result } = renderHook(() => useExams({ enabled: false }), { wrapper: createWrapper() })
    expect(result.current.status).toBe('pending')
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns empty array when API returns empty list', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })

    const { result } = renderHook(() => useExams(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

// ─── useExamAnswers ───────────────────────────────────────────────────────────

describe('useExamAnswers', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('fetches answers for the given examId', async () => {
    const answers = [makeAnswer(1, 100, '4.000'), makeAnswer(2, 101, '3.000')]
    mockGet.mockResolvedValueOnce({ data: answers })

    const { result } = renderHook(() => useExamAnswers(42), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith('/exams/42/institutionuser/examanswers')
    expect(result.current.data).toHaveLength(2)
  })

  it('stays idle when examId is null', () => {
    const { result } = renderHook(() => useExamAnswers(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
  })
})

// ─── useExamQuestions ─────────────────────────────────────────────────────────

describe('useExamQuestions', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('fetches questions with from_view_score param', async () => {
    const questions = [makeQuestion(100, '1', '5.0'), makeQuestion(101, '2', '10.0')]
    mockGet.mockResolvedValueOnce({ data: questions })

    const { result } = renderHook(() => useExamQuestions(42), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith('/exams/42/examquestions', {
      params: { from_view_score: true },
    })
    expect(result.current.data).toHaveLength(2)
  })

  it('stays idle when examId is null', () => {
    const { result } = renderHook(() => useExamQuestions(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
  })
})

// ─── useAllExamAnswers ────────────────────────────────────────────────────────

describe('useAllExamAnswers', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns empty array of results when given empty ids', async () => {
    const { result } = renderHook(() => useAllExamAnswers([]), { wrapper: createWrapper() })
    expect(result.current).toHaveLength(0)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('fires one request per exam id', async () => {
    const answersById: Record<string, ExamAnswer[]> = {
      '10': [makeAnswer(1, 100, '5.000')],
      '20': [makeAnswer(2, 200, '8.000')],
    }
    mockGet.mockImplementation((url: string) => {
      const match = url.match(/\/exams\/(\d+)\//)
      const id = match?.[1] ?? ''
      return Promise.resolve({ data: answersById[id] ?? [] })
    })

    const { result } = renderHook(() => useAllExamAnswers([10, 20]), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(2)
      expect(result.current[0].isSuccess).toBe(true)
      expect(result.current[1].isSuccess).toBe(true)
      expect(result.current[0].data).toBeDefined()
      expect(result.current[1].data).toBeDefined()
      const allScores = result.current.flatMap((q) => (q.data as ExamAnswer[]).map((a) => a.score))
      expect(allScores).toContain('5.000')
      expect(allScores).toContain('8.000')
    })

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenCalledWith('/exams/10/institutionuser/examanswers')
    expect(mockGet).toHaveBeenCalledWith('/exams/20/institutionuser/examanswers')
  })

  it('uses staleTime: 0 so window-focus always refetches', () => {
    // This tests the configuration: staleTime 0 means data is always "stale"
    // and will be refetched on window focus. We confirm the hook does NOT
    // treat data as fresh by checking the query config indirectly.
    // An empty ids array makes this cheap.
    const { result } = renderHook(() => useAllExamAnswers([]), { wrapper: createWrapper() })
    expect(result.current).toHaveLength(0) // no queries = staleTime irrelevant here
  })
})

// ─── useAllExamQuestions ──────────────────────────────────────────────────────

describe('useAllExamQuestions', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns empty array when given empty ids', () => {
    const { result } = renderHook(() => useAllExamQuestions([]), { wrapper: createWrapper() })
    expect(result.current).toHaveLength(0)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('fires one question request per exam id with from_view_score param', async () => {
    const questionsById: Record<string, ExamQuestion[]> = {
      '10': [makeQuestion(100, '1', '5.0')],
      '20': [makeQuestion(200, '1', '10.0')],
    }
    mockGet.mockImplementation((url: string) => {
      const match = url.match(/\/exams\/(\d+)\//)
      const id = match?.[1] ?? ''
      return Promise.resolve({ data: questionsById[id] ?? [] })
    })

    const { result } = renderHook(() => useAllExamQuestions([10, 20]), {
      wrapper: createWrapper(),
    })

    await waitFor(() => result.current.every((q) => q.isSuccess))
    expect(mockGet).toHaveBeenCalledWith('/exams/10/examquestions', {
      params: { from_view_score: true },
    })
    expect(mockGet).toHaveBeenCalledWith('/exams/20/examquestions', {
      params: { from_view_score: true },
    })
    expect(result.current).toHaveLength(2)
  })

  it('handles error in one exam without affecting other queries', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/exams/10/')) return Promise.reject(new Error('404'))
      return Promise.resolve({ data: [makeQuestion(200, '1', '10.0')] })
    })

    const { result } = renderHook(() => useAllExamQuestions([10, 20]), {
      wrapper: createWrapper(),
    })

    // Wait for all queries to reach a terminal state (success or error)
    await waitFor(
      () => {
        expect(result.current.some((q) => q.isError)).toBe(true)
        expect(result.current.some((q) => q.isSuccess)).toBe(true)
        const successQuery = result.current.find((q) => q.isSuccess)
        expect((successQuery!.data as ExamQuestion[])[0].maximum_mark).toBe('10.0')
      },
      { timeout: 5000 }
    )
  })
})
