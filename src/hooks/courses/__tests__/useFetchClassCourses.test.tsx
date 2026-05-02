import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFetchClassCourses } from "../useFetchClassCourses";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/users/profile";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/hooks/users/profile", () => ({
  useProfile: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
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

describe("useFetchClassCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch class courses successfully", async () => {
    const mockProfile = { class: { id: 100 } };
    (useProfile as any).mockReturnValue({ data: mockProfile });

    const mockData = [{ course_code: "CUSTOM1", course_name: "Custom Course" }];
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ data: mockData, error: null })),
    };
    (createClient as any).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useFetchClassCourses({ semester: "1", year: "2023" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(mockSupabase.from).toHaveBeenCalledWith("class_courses");
  });

  it("should handle error and return empty array", async () => {
    const mockProfile = { class: { id: 100 } };
    (useProfile as any).mockReturnValue({ data: mockProfile });

    const mockError = { message: "Database Error" };
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ data: null, error: mockError })),
    };
    (createClient as any).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useFetchClassCourses({ semester: "1", year: "2023" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("should handle generic exception in queryFn", async () => {
     const mockProfile = { class: { id: 100 } };
    (useProfile as any).mockReturnValue({ data: mockProfile });
    (createClient as any).mockImplementation(() => {
        throw new Error("Supabase crashed");
    });

    const { result } = renderHook(() => useFetchClassCourses({ semester: "1", year: "2023" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("should not run if semester/year/classId is missing", async () => {
    (useProfile as any).mockReturnValue({ data: null });

    const { result } = renderHook(() => useFetchClassCourses({ semester: "1", year: "2023" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isEnabled).toBe(false);
  });

  it("should handle profile with no class", async () => {
    (useProfile as any).mockReturnValue({ data: { class: null } });
    const { result } = renderHook(() => useFetchClassCourses({ semester: "1", year: "2023" }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isEnabled).toBe(false);
  });
});
