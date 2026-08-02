import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDefaultInstitute,
  useDefaultInstitutionUser,
  useInstitutions,
  useUpdateDefaultInstitutionUser,
} from "../institutions";
import axiosInstance from "@/lib/axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/lib/query-utils", () => ({
  retryOnce: false,
}));

const createWrapper = (queryClient: QueryClient) => {
  const QueryClientWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  QueryClientWrapper.displayName = "QueryClientWrapper";
  return QueryClientWrapper;
};

describe("institutions hooks", () => {
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

  describe("useInstitutions", () => {
    it("should fetch and filter student institutions", async () => {
      const mockData = [
        { id: 1, institution_role: { name: "student" } },
        { id: 2, institution_role: { name: "staff" } },
      ];
      (axiosInstance.get as any).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useInstitutions(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].id).toBe(1);
    });

    it("should throw if response is null", async () => {
      (axiosInstance.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useInstitutions(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe(
        "Failed to fetch institutions",
      );
    });

    it("should throw if no student institutions found", async () => {
      (axiosInstance.get as any).mockResolvedValueOnce({
        data: [{ id: 2, institution_role: { name: "staff" } }],
      });
      const { result } = renderHook(() => useInstitutions(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe(
        "No student institutions found",
      );
    });
  });

  describe("useDefaultInstitute", () => {
    it("should fetch default institute id", async () => {
      (axiosInstance.get as any).mockResolvedValueOnce({ data: 123 });
      const { result } = renderHook(() => useDefaultInstitute(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(123);
    });

    it("should throw if response is null", async () => {
      (axiosInstance.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useDefaultInstitute(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useDefaultInstitutionUser", () => {
    it("should fetch and auto-correct if default is not a student institution", async () => {
      const studentInst = { id: 10, institution_role: { name: "student" } };

      // First, useInstitutions is called (internally)
      // We need to mock useQuery behavior or pre-populate cache
      queryClient.setQueryData(["institutions"], [studentInst]);

      (axiosInstance.get as any).mockResolvedValueOnce({ data: 20 }); // Current default is 20
      (axiosInstance.post as any).mockResolvedValueOnce({
        data: { success: true },
      }); // Update called

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(10); // Auto-corrected to 10
      expect(axiosInstance.post).toHaveBeenCalled();
    });

    it("should return default if it is valid", async () => {
      const studentInst = { id: 10, institution_role: { name: "student" } };
      queryClient.setQueryData(["institutions"], [studentInst]);
      (axiosInstance.get as any).mockResolvedValueOnce({ data: 10 });

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(10);
      expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it("should throw if fetch fails", async () => {
      queryClient.setQueryData(["institutions"], [{ id: 1 }]);
      (axiosInstance.get as any).mockResolvedValueOnce(null);

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useUpdateDefaultInstitutionUser", () => {
    it("should update and invalidate queries", async () => {
      (axiosInstance.post as any).mockResolvedValueOnce({
        data: { success: true },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useUpdateDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync(123);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["defaultInstitutionUser"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["user"] });
    });

    it("should throw if response is null", async () => {
      (axiosInstance.post as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useUpdateDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });
      await act(async () => {
        try {
          await result.current.mutateAsync(123);
        } catch {
          // expected to throw
        }
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it("should handle case where no institutions are found for auto-correction", async () => {
      queryClient.setQueryData(["institutions"], []);
      (axiosInstance.get as any).mockResolvedValueOnce({ data: 20 });

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(20);
    });

    it("should handle case where default institution user is null", async () => {
      queryClient.setQueryData(["institutions"], [{
        id: 10,
        institution_role: { name: "student" },
      }]);
      (axiosInstance.get as any).mockResolvedValueOnce({ data: null });

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("should handle case where institutions array contains a null element", async () => {
      queryClient.setQueryData(["institutions"], [null]);
      (axiosInstance.get as any).mockResolvedValueOnce({ data: 20 });

      const { result } = renderHook(() => useDefaultInstitutionUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(20);
    });
  });
});
