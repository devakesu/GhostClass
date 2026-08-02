import { act, renderHook, waitFor } from "@testing-library/react";
vi.unmock("@/hooks/users/profile");
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProfile, useUpdateProfile } from "../profile";
import axiosInstance from "@/lib/axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import * as Sentry from "@sentry/nextjs";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
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

describe("profile hooks", () => {
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

  describe("useProfile", () => {
    it("should fetch profile successfully", async () => {
      const mockProfile = { id: "1", first_name: "Test" };
      (axiosInstance.get as any).mockResolvedValueOnce({ data: mockProfile });

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockProfile);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({ params: undefined }),
      );
    });

    it("should send sync and force params when explicitly requested (uses separate query key)", async () => {
      const mockProfile = { id: "1", first_name: "Test" };
      (axiosInstance.get as any).mockResolvedValueOnce({ data: mockProfile });

      const { result } = renderHook(
        () => useProfile({ sync: true, force: true }),
        {
          wrapper: createWrapper(queryClient),
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(axiosInstance.get).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({ params: { sync: "true", force: "true" } }),
      );
    });

    it("should use initialData", () => {
      const initialData = { id: "1", first_name: "Initial" } as any;
      const { result } = renderHook(() => useProfile({ initialData }), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.data).toEqual(initialData);
    });
  });

  describe("useUpdateProfile", () => {
    it("should update profile successfully and invalidate queries", async () => {
      const updateData = { first_name: "New" };
      (axiosInstance.patch as any).mockResolvedValueOnce({ data: updateData });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await act(async () => {
        await result.current.mutateAsync({ data: updateData });
      });

      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "/api/profile",
        updateData,
        expect.any(Object),
      );
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
    });

    it("should perform optimistic update and rollback on error", async () => {
      const previousProfile = { id: "1", first_name: "Old" };
      queryClient.setQueryData(["profile"], previousProfile);

      const updateData = { first_name: "New" };
      const error = new Error("Update failed");
      (axiosInstance.patch as any).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      });

      // We need to trigger the mutation
      try {
        await act(async () => {
          await result.current.mutateAsync({ data: updateData });
        });
      } catch {
        // expected error
      }

      // Check if Sentry was called
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.any(Object),
      );

      // Check if cache was reverted
      expect(queryClient.getQueryData(["profile"])).toEqual(previousProfile);
    });

    it("should handle error rollback when no previous profile exists", async () => {
      const error = new Error("Update failed");
      (axiosInstance.patch as any).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      });

      try {
        await act(async () => {
          await result.current.mutateAsync({ data: { first_name: "New" } });
        });
      } catch {
        // expected error
      }

      expect(queryClient.getQueryData(["profile"])).toBeUndefined();
    });

    it("should handle optimistic update when no previous profile exists", async () => {
      const updateData = { first_name: "New" };
      (axiosInstance.patch as any).mockResolvedValueOnce({ data: updateData });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ data: updateData });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });
});
