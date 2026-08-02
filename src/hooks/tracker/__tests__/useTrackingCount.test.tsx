import { renderHook, waitFor } from "@testing-library/react";
vi.unmock("@/hooks/tracker/useTrackingCount");
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackingCount } from "../useTrackingCount";
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
  redact: vi.fn((_key, val) => val),
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

describe("useTrackingCount", () => {
  const mockUser = { id: 123, username: "testuser" };
  const mockSupabase = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: 10, error: null })),
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

  it("should fetch count successfully", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: {} } },
    });

    const { result } = renderHook(() => useTrackingCount(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(10);
    expect(mockSupabase.from).toHaveBeenCalledWith("tracker");
  });

  it("should return 0 if no session", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useTrackingCount(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("should be disabled if semester or year missing", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: {} } },
    });
    (useFetchSemester as any).mockReturnValue({ data: null });

    const { result } = renderHook(() => useTrackingCount(mockUser), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("should handle error and capture exception", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: {} } },
    });
    const mockError = { message: "DB Error" };

    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: null, error: mockError })),
        })),
      })),
    } as any);

    const { result } = renderHook(() => useTrackingCount(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
    expect(logger.error).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      mockError,
      expect.any(Object),
    );
  });

  it("should return 0 if count is null", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: {} } },
    });

    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: null, error: null })),
        })),
      })),
    } as any);

    const { result } = renderHook(() => useTrackingCount(mockUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("should be disabled if no user", async () => {
    const { result } = renderHook(() => useTrackingCount(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
