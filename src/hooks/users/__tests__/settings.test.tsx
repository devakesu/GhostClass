import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFetchSemester, useFetchAcademicYear, useSetSemester, useSetAcademicYear, useFetchUserSettings } from "../settings";
import axios from "@/lib/axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

vi.mock("@/lib/query-utils", () => ({
  makeRetryFn: () => false,
}));

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock isAxiosError helper
vi.mock("axios", async () => {
    const actual = await vi.importActual("axios") as any;
    return {
        ...actual,
        isAxiosError: vi.fn((err: any) => err && err.isAxiosError === true),
    };
});

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("settings hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  describe("useFetchSemester", () => {
    it("should fetch semester successfully", async () => {
      (axios.get as any).mockResolvedValueOnce({ data: "even" });

      const { result } = renderHook(() => useFetchSemester(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe("even");
    });

    it("should return null on 404 error", async () => {
      const error = { isAxiosError: true, response: { status: 404 } };
      (axios.get as any).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useFetchSemester(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("should throw on other errors", async () => {
        const error = { isAxiosError: true, response: { status: 500 } };
        (axios.get as any).mockRejectedValueOnce(error);

        const { result } = renderHook(() => useFetchSemester(), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useFetchAcademicYear", () => {
    it("should fetch academic year successfully", async () => {
      (axios.get as any).mockResolvedValueOnce({ data: "2023-24" });

      const { result } = renderHook(() => useFetchAcademicYear(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe("2023-24");
    });

    it("should return null on 404 error", async () => {
        const error = { isAxiosError: true, response: { status: 404 } };
        (axios.get as any).mockRejectedValueOnce(error);

        const { result } = renderHook(() => useFetchAcademicYear(), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBeNull();
    });
  });

  describe("useSetSemester", () => {
    it("should update semester and invalidate related queries", async () => {
      (axios.post as any).mockResolvedValueOnce({ data: { success: true } });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useSetSemester(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ default_semester: "odd" });
      });

      expect(queryClient.getQueryData(["semester"])).toBe("odd");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["courses"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["attendance"] });
    });

    it("should handle error during mutation", async () => {
        const error = new Error("Failed");
        (axios.post as any).mockRejectedValueOnce(error);

        const { result } = renderHook(() => useSetSemester(), {
            wrapper: createWrapper(queryClient),
        });

        try {
            await act(async () => {
                await result.current.mutateAsync({ default_semester: "odd" });
            });
        } catch (e) {}

        expect(logger.error).toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });
  });

  describe("useSetAcademicYear", () => {
    it("should update year and invalidate related queries", async () => {
      (axios.post as any).mockResolvedValueOnce({ data: { success: true } });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useSetAcademicYear(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ default_academic_year: "2024" });
      });

      expect(queryClient.getQueryData(["academic-year"])).toBe("2024");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["track_data"] });
    });

    it("should handle error during mutation", async () => {
        const error = new Error("Failed");
        (axios.post as any).mockRejectedValueOnce(error);

        const { result } = renderHook(() => useSetAcademicYear(), {
            wrapper: createWrapper(queryClient),
        });

        try {
            await act(async () => {
                await result.current.mutateAsync({ default_academic_year: "2024" });
            });
        } catch (e) {}

        expect(logger.error).toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe("useFetchUserSettings", () => {
    it("should return aggregate data", async () => {
      (axios.get as any)
        .mockResolvedValueOnce({ data: "even" }) // semester
        .mockResolvedValueOnce({ data: "2023" }); // year

      const { result } = renderHook(() => useFetchUserSettings(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data).toEqual({ semester: "even", academicYear: "2023" });
      
      // Test refetch
      await act(async () => {
          await result.current.refetch();
      });
      expect(axios.get).toHaveBeenCalled(); 
    });
  });
});
