import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTrackingData } from "../useTrackingData";
import { createClient } from "@/lib/supabase/client";
import { useFetchAcademicYear, useFetchSemester } from "../../users/settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("../../users/settings", () => ({
  useFetchAcademicYear: vi.fn(),
  useFetchSemester: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/utils", () => ({
  redact: vi.fn((key, val) => val),
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

describe("useTrackingData", () => {
  const mockUser = { id: "123", username: "testuser" };
  const mockSupabase = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null })),
            })),
          })),
        })),
      })),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as any).mockReturnValue(mockSupabase);
    (useFetchSemester as any).mockReturnValue({ data: "1" });
    (useFetchAcademicYear as any).mockReturnValue({ data: "2023" });
  });

  it("should fetch tracking data successfully", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } } });
    
    const { result } = renderHook(() => useTrackingData(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("tracker");
  });

  it("should respect options override", async () => {
     mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } } });
     
     const { result } = renderHook(() => useTrackingData(mockUser, { semester: "2", year: "2024" }), {
       wrapper: createWrapper(),
     });

     await waitFor(() => expect(result.current.isSuccess).toBe(true));
     // We can't easily check the nested calls without more complex spies, 
     // but the key will change and triggers a re-fetch.
  });

  it("should return [] if no session", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

    const { result } = renderHook(() => useTrackingData(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("should return [] if semester or year missing", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } } });
    (useFetchSemester as any).mockReturnValue({ data: null });

    const { result } = renderHook(() => useTrackingData(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("should handle error and capture exception", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } } });
    const mockError = { message: "DB Error" };
    
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: null, error: mockError })),
            })),
          })),
        })),
      })),
    } as any);

    const { result } = renderHook(() => useTrackingData(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("should handle error without user id", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } } });
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: null, error: { message: "err" } })),
            })),
          })),
        })),
      })),
    } as any);

    const { result } = renderHook(() => useTrackingData({ username: "u" } as any), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("should be disabled if no user or options.enabled is false", async () => {
    const { result } = renderHook(() => useTrackingData(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");

    const { result: result2 } = renderHook(() => useTrackingData(mockUser, { enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result2.current.fetchStatus).toBe("idle");
  });
});
