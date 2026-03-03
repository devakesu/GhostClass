// Fetch exams / scores hook
// src/hooks/courses/exams.ts

import axios from "@/lib/axios";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Exam, ExamAnswer, ExamQuestion } from "@/types";
import { retryOnce } from "@/lib/query-utils";

/**
 * React Query hook for fetching the current user's exams and scores.
 * Maps to GET /api/backend/exams via the backend proxy.
 *
 * @param options.enabled - Set to false to disable the query.
 * @returns Query result with an array of Exam objects.
 *
 * Query Configuration:
 * - Stale time: 2 minutes
 * - Cache time: 10 minutes
 * - Window focus refetch: enabled
 * - Reconnect refetch: enabled
 * - Retry: once on failure
 *
 * @example
 * ```tsx
 * const { data: exams, isLoading } = useExams();
 * ```
 */
export const useExams = (options?: { enabled?: boolean }) => {
  return useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: async () => {
      const res = await axios.get("/exams");
      if (!res) throw new Error("Failed to fetch exams data");
      return res.data;
    },
    enabled: options?.enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: retryOnce,
  });
};

/**
 * React Query hook for fetching exam questions with per-question max marks.
 * Maps to GET /api/backend/exams/{examId}/examquestions?from_view_score=true.
 *
 * Fetched alongside `useExamAnswers` so the drawer can join them by `examquestion_id`.
 *
 * @param examId - Exam ID to fetch questions for; pass null to disable.
 * @returns Query result with an array of ExamQuestion objects.
 *
 * @example
 * ```tsx
 * const { data: questions } = useExamQuestions(selectedExamId);
 * ```
 */
export const useExamQuestions = (examId: number | null) => {
  return useQuery<ExamQuestion[]>({
    queryKey: ["exam-questions", examId],
    queryFn: async () => {
      const res = await axios.get(`/exams/${examId}/examquestions`, {
        params: { from_view_score: true },
      });
      if (!res) throw new Error("Failed to fetch exam questions");
      return res.data;
    },
    enabled: examId !== null,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: retryOnce,
  });
};

/**
 * React Query hook for fetching per-question answers and scores for a single exam.
 * Maps to GET /api/backend/exams/{examId}/institutionuser/examanswers.
 *
 * Only fetches when `examId` is non-null (e.g. when a card is selected).
 *
 * @param examId - Exam ID to fetch answers for; pass null to disable.
 * @returns Query result with an array of ExamAnswer objects.
 *
 * @example
 * ```tsx
 * const { data: answers, isLoading } = useExamAnswers(selectedExamId);
 * ```
 */
export const useExamAnswers = (examId: number | null) => {
  return useQuery<ExamAnswer[]>({
    queryKey: ["exam-answers", examId],
    queryFn: async () => {
      const res = await axios.get(
        `/exams/${examId}/institutionuser/examanswers`
      );
      if (!res) throw new Error("Failed to fetch exam answers");
      return res.data;
    },
    enabled: examId !== null,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    retry: retryOnce,
  });
};

/**
 * Fires parallel examanswers requests for every exam in the list.
 * Uses the same query keys as `useExamAnswers` so the drawer reads from cache.
 *
 * @param examIds - Array of exam IDs to pre-fetch answers for.
 * @returns Array of query results in the same order as `examIds`.
 *
 * @example
 * ```tsx
 * const queries = useAllExamAnswers(exams.map(e => e.id));
 * ```
 */
export const useAllExamAnswers = (examIds: number[]) => {
  return useQueries({
    queries: examIds.map((id) => ({
      queryKey: ["exam-answers", id],
      queryFn: async () => {
        const res = await axios.get(
          `/exams/${id}/institutionuser/examanswers`
        );
        if (!res) throw new Error("Failed to fetch exam answers");
        return res.data as ExamAnswer[];
      },
      staleTime: 0,
      gcTime: 15 * 60 * 1000,
      retry: retryOnce,
    })),
  });
};

/**
 * Fires parallel examquestions requests for every exam in the list.
 * Uses the same query keys as `useExamQuestions` so the drawer reads from cache.
 *
 * @param examIds - Array of exam IDs to pre-fetch questions for.
 */
export const useAllExamQuestions = (examIds: number[]) => {
  return useQueries({
    queries: examIds.map((id) => ({
      queryKey: ["exam-questions", id],
      queryFn: async () => {
        const res = await axios.get(`/exams/${id}/examquestions`, {
          params: { from_view_score: true },
        });
        if (!res) throw new Error("Failed to fetch exam questions");
        return res.data as ExamQuestion[];
      },
      staleTime: 10 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: retryOnce,
    })),
  });
};
