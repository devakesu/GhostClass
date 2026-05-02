import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExams, useExamQuestions, useExamAnswers, useAllExamAnswers, useAllExamQuestions } from "../exams";
import axios from "@/lib/axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@/lib/query-utils", () => ({
  retryOnce: false,
}));

vi.mock("../../users/settings", () => ({
  useFetchAcademicYear: vi.fn(() => ({ data: "2023" })),
  useFetchSemester: vi.fn(() => ({ data: "1" })),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("exams hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useExams", () => {
    it("should fetch exams", async () => {
      const mockExams = [{ id: 1, name: "Final" }];
      (axios.get as any).mockResolvedValueOnce({ data: mockExams });

      const { result } = renderHook(() => useExams({ enabled: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockExams);
      expect(axios.get).toHaveBeenCalledWith("/exams");
    });

    it("should throw if response is null", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useExams({ enabled: true }), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useExamQuestions", () => {
    it("should fetch exam questions", async () => {
      const mockQuestions = [{ id: 101, text: "Q1" }];
      (axios.get as any).mockResolvedValueOnce({ data: mockQuestions });

      const { result } = renderHook(() => useExamQuestions(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockQuestions);
    });

    it("should throw if response is null", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useExamQuestions(1), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useExamAnswers", () => {
    it("should fetch exam answers", async () => {
      const mockAnswers = [{ id: 201, score: 50 }];
      (axios.get as any).mockResolvedValueOnce({ data: mockAnswers });

      const { result } = renderHook(() => useExamAnswers(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockAnswers);
    });

    it("should throw if response is null", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useExamAnswers(1), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useAllExamAnswers", () => {
    it("should fetch answers for multiple exams", async () => {
      (axios.get as any)
        .mockResolvedValueOnce({ data: [{ id: 1 }] })
        .mockResolvedValueOnce({ data: [{ id: 2 }] });

      const { result } = renderHook(() => useAllExamAnswers([1, 2]), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current[0].isSuccess).toBe(true);
        expect(result.current[1].isSuccess).toBe(true);
      });
    });

    it("should handle null response in parallel queries", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useAllExamAnswers([1]), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current[0].isError).toBe(true));
    });
  });

  describe("useAllExamQuestions", () => {
    it("should fetch questions for multiple exams", async () => {
      (axios.get as any)
        .mockResolvedValueOnce({ data: [{ id: 11 }] })
        .mockResolvedValueOnce({ data: [{ id: 22 }] });

      const { result } = renderHook(() => useAllExamQuestions([1, 2]), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current[0].isSuccess).toBe(true);
        expect(result.current[1].isSuccess).toBe(true);
      });
    });

    it("should handle null response in parallel queries", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useAllExamQuestions([1]), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current[0].isError).toBe(true));
    });
  });
});
