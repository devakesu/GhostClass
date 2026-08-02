import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useFetchAcademicYear,
  useFetchSemester,
  useFetchUserSettings,
  useSetAcademicYear,
  useSetSemester,
} from "../settings";
import axios from "@/lib/axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/axios");
vi.mock("@sentry/nextjs");

// Unmock the settings hooks that are globally mocked in vitest.setup.ts
vi.unmock("../settings");

describe("settings hooks", () => {
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

  describe("useFetchSemester", () => {
    it("fetches semester successfully", async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: "even" });
      const { result } = renderHook(() => useFetchSemester(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      console.log("DATA TYPE:", typeof result.current.data);
      console.log("DATA VALUE:", JSON.stringify(result.current.data));
      expect(result.current.data).toEqual("even");
    });

    it("returns null on 404", async () => {
      vi.mocked(axios.get).mockRejectedValue({
        isAxiosError: true,
        response: { status: 404 },
      });
      const { result } = renderHook(() => useFetchSemester(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(null);
    });
  });

  describe("useFetchAcademicYear", () => {
    it("fetches academic year successfully", async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: "2023-24" });
      const { result } = renderHook(() => useFetchAcademicYear(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe("2023-24");
    });
  });

  describe("useSetSemester", () => {
    it("updates semester and invalidates queries", async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });
      const { result } = renderHook(() => useSetSemester(), { wrapper });

      await result.current.mutateAsync({ default_semester: "odd" });

      expect(axios.post).toHaveBeenCalledWith(
        "/user/setting/default_semester",
        { default_semester: "odd" },
      );
      expect(queryClient.getQueryData(["semester"])).toBe("odd");
    });
  });

  describe("useSetAcademicYear", () => {
    it("updates academic year successfully", async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });
      const { result } = renderHook(() => useSetAcademicYear(), { wrapper });

      await result.current.mutateAsync({ default_academic_year: "2024-25" });

      expect(axios.post).toHaveBeenCalledWith(
        "/user/setting/default_academic_year",
        { default_academic_year: "2024-25" },
      );
      expect(queryClient.getQueryData(["academic-year"])).toBe("2024-25");
    });
  });

  describe("useFetchUserSettings", () => {
    it("combines semester and academic year queries", async () => {
      vi.mocked(axios.get).mockImplementation((url: any) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "even" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2023-24" });
        }
        return Promise.reject(new Error("Not found"));
      });

      const { result } = renderHook(() => useFetchUserSettings(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data).toEqual({
        semester: "even",
        academicYear: "2023-24",
      });
    });
  });
});
