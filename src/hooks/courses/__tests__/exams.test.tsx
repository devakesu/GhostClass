import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useExams, useExamQuestions, useExamAnswers, useBatchExamDetails, useAllExamAnswers, useAllExamQuestions } from '../exams';
import axios from '@/lib/axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/axios');
vi.mock('../users/settings', () => ({
  useFetchSemester: vi.fn(() => ({ data: 'odd' })),
  useFetchAcademicYear: vi.fn(() => ({ data: '2024-25' })),
}));

describe('exams hooks', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe('useExams', () => {
    it('fetches exams successfully', async () => {
      const mockExams = [{ id: 1, name: 'Midterm' }];
      vi.mocked(axios.get).mockResolvedValue({ data: mockExams });
      
      const { result } = renderHook(() => useExams({ enabled: true }), { wrapper });
      
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockExams);
      expect(axios.get).toHaveBeenCalledWith('/exams');
    });

  });

  describe('useExamQuestions', () => {
    it('fetches questions for an exam', async () => {
      const mockQuestions = [{ id: 10, question_no: '1' }];
      vi.mocked(axios.get).mockResolvedValue({ data: mockQuestions });
      
      const { result } = renderHook(() => useExamQuestions(1), { wrapper });
      
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockQuestions);
      expect(axios.get).toHaveBeenCalledWith('/exams/1/examquestions', {
        params: { from_view_score: true },
      });
    });
  });

  describe('useExamAnswers', () => {
    it('fetches answers for an exam', async () => {
      const mockAnswers = [{ id: 20, score: 85 }];
      vi.mocked(axios.get).mockResolvedValue({ data: mockAnswers });
      
      const { result } = renderHook(() => useExamAnswers(1), { wrapper });
      
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockAnswers);
      expect(axios.get).toHaveBeenCalledWith('/exams/1/institutionuser/examanswers');
    });
  });

  describe('useAllExamAnswers', () => {
    it('fetches all answers for multiple exams', async () => {
      const mockAnswers = [{ id: 20, score: 85 }];
      vi.mocked(axios.get).mockResolvedValue({ data: mockAnswers });
      
      const { result } = renderHook(() => useAllExamAnswers([1, 2]), { wrapper });
      await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
      await waitFor(() => expect(result.current[1].isSuccess).toBe(true));
      expect(result.current[0].data).toEqual(mockAnswers);
      expect(result.current[1].data).toEqual(mockAnswers);
      expect(axios.get).toHaveBeenCalledWith('/exams/1/institutionuser/examanswers');
      expect(axios.get).toHaveBeenCalledWith('/exams/2/institutionuser/examanswers');
    });
  });

  describe('useAllExamQuestions', () => {
    it('fetches all questions for multiple exams', async () => {
      const mockQuestions = [{ id: 10, question_no: '1' }];
      vi.mocked(axios.get).mockResolvedValue({ data: mockQuestions });
      
      const { result } = renderHook(() => useAllExamQuestions([1, 2]), { wrapper });
      
      await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
      await waitFor(() => expect(result.current[1].isSuccess).toBe(true));
      
      expect(result.current[0].data).toEqual(mockQuestions);
      expect(result.current[1].data).toEqual(mockQuestions);
      expect(axios.get).toHaveBeenCalledWith('/exams/1/examquestions', {
        params: { from_view_score: true },
      });
    });
  });

  describe('useBatchExamDetails', () => {
    it('fetches batch details', async () => {
      const mockBatch = {
        1: { questions: [], answers: [] }
      };
      vi.mocked(axios.post).mockResolvedValue({ data: mockBatch });
      
      const { result } = renderHook(() => useBatchExamDetails([1]), { wrapper });
      
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockBatch);
      expect(axios.post).toHaveBeenCalledWith('/api/scores/batch', { examIds: [1] }, { baseURL: '' });
    });

    it('returns empty object for empty examIds', async () => {
      const { result } = renderHook(() => useBatchExamDetails([]), { wrapper });
      
      // Since it's disabled when length is 0, it won't fetch
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
    });
  });
});
