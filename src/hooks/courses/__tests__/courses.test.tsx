import { renderHook, waitFor } from "@testing-library/react";
vi.unmock('@/hooks/courses/courses')
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFetchCourses } from "../courses";
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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const QueryClientWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  QueryClientWrapper.displayName = "QueryClientWrapper";
  return QueryClientWrapper;
};

describe("useFetchCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch and format courses", async () => {
    const mockCourses = [
      { id: 1, name: "Math" },
      { id: 2, name: "Science" },
    ];
    (axios.get as any).mockResolvedValueOnce({ data: mockCourses });

    const { result } = renderHook(() => useFetchCourses({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    
    expect(result.current.data?.courses["1"]).toEqual(mockCourses[0]);
    expect(result.current.data?.courses["2"]).toEqual(mockCourses[1]);
    expect(axios.get).toHaveBeenCalledWith("/institutionuser/courses/withusers");
  });

  it("should handle empty data", async () => {
    (axios.get as any).mockResolvedValueOnce({ data: null });

    const { result } = renderHook(() => useFetchCourses({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.courses).toEqual({});
  });

  it("should handle fetch error", async () => {
    (axios.get as any).mockRejectedValueOnce(new Error("API Error"));

    const { result } = renderHook(() => useFetchCourses({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("should throw error if response is null", async () => {
    (axios.get as any).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useFetchCourses({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Failed to fetch courses data");
  });
});
