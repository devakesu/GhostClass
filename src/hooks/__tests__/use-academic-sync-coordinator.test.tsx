import { beforeEach, describe, expect, it, vi } from "vitest";
vi.unmock("@/hooks/users/settings");
vi.unmock("../use-academic-sync-coordinator");
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "@/lib/axios";
import { toast } from "sonner";
import {
  fetchLiveAcademicPeriod,
  invalidateAllTermQueries,
  useAcademicSyncCoordinator,
} from "../use-academic-sync-coordinator";

const mockRefresh = vi.fn();
const mockPathname = vi.fn(() => "/dashboard");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
  usePathname: () => mockPathname(),
}));

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    dev: vi.fn(),
    error: vi.fn(),
  },
}));

describe("use-academic-sync-coordinator", () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe("fetchLiveAcademicPeriod", () => {
    it("sends cache-busting params and anti-cache headers", async () => {
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: { default_semester: "even" } });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({
            data: { default_academic_year: "2024-25" },
          });
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await fetchLiveAcademicPeriod();

      expect(result).toEqual({
        semester: "even",
        academicYear: "2024-25",
      });

      expect(axios.get).toHaveBeenCalledWith(
        "/user/setting/default_semester",
        expect.objectContaining({
          params: expect.objectContaining({ _t: expect.any(Number) }),
          headers: expect.objectContaining({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }),
      );
    });

    it("extracts values correctly from raw string responses", async () => {
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "odd" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2023-24" });
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await fetchLiveAcademicPeriod();

      expect(result).toEqual({
        semester: "odd",
        academicYear: "2023-24",
      });
    });

    it("handles request failures gracefully without crashing", async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error("Network timeout"));

      const result = await fetchLiveAcademicPeriod();

      expect(result).toEqual({
        semester: null,
        academicYear: null,
      });
    });
  });

  describe("invalidateAllTermQueries", () => {
    it("invalidates all term-dependent query keys", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await invalidateAllTermQueries(queryClient);

      const expectedKeys = [
        ["semester"],
        ["academic-year"],
        ["courses"],
        ["attendance-report"],
        ["attendance-report-all"],
        ["class_courses"],
        ["course_instructors"],
        ["track_data"],
        ["count"],
        ["tracking_count"],
        ["profile"],
        ["profile", "synced"],
        ["exams"],
        ["exam-answers"],
        ["exam-questions"],
        ["exam-details-batch"],
        ["student_leaves"],
      ];

      for (const key of expectedKeys) {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: key });
      }
    });
  });

  describe("useAcademicSyncCoordinator hook", () => {
    it("detects semester rollover, updates cache, invalidates queries, refreshes router, and notifies user", async () => {
      // Baseline in query cache is "odd", 2024-25
      queryClient.setQueryData(["semester"], "odd");
      queryClient.setQueryData(["academic-year"], "2024-25");

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Upstream returns "even", 2024-25
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "even" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2024-25" });
        }
        if (url === "/api/profile") {
          return Promise.resolve({ data: { id: "1" } });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderHook(() => useAcademicSyncCoordinator(), { wrapper });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["courses"] });
      });

      expect(axios.get).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          baseURL: "",
          params: expect.objectContaining({
            sync: "true",
            force: "true",
            _t: expect.any(Number),
          }),
        }),
      );

      expect(queryClient.getQueryData(["semester"])).toBe("even");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining("EVEN 2024-25"),
      );
    });

    it("detects academic year rollover", async () => {
      queryClient.setQueryData(["semester"], "even");
      queryClient.setQueryData(["academic-year"], "2023-24");

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "even" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2024-25" });
        }
        if (url === "/api/profile") {
          return Promise.resolve({ data: { id: "1" } });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderHook(() => useAcademicSyncCoordinator(), { wrapper });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["courses"] });
      });

      expect(axios.get).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          baseURL: "",
          params: expect.objectContaining({
            sync: "true",
            force: "true",
          }),
        }),
      );

      expect(queryClient.getQueryData(["academic-year"])).toBe("2024-25");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("does not invalidate or refresh if academic period is unchanged", async () => {
      queryClient.setQueryData(["semester"], "even");
      queryClient.setQueryData(["academic-year"], "2024-25");

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "even" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2024-25" });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderHook(() => useAcademicSyncCoordinator(), { wrapper });

      // Wait a moment for initial check to settle
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("triggers check on window focus", async () => {
      queryClient.setQueryData(["semester"], "odd");
      queryClient.setQueryData(["academic-year"], "2024-25");

      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "odd" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2024-25" });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderHook(() => useAcademicSyncCoordinator(), { wrapper });

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledTimes(2);
      });

      // User switches tab and returns; semester has now changed to "even"
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url === "/user/setting/default_semester") {
          return Promise.resolve({ data: "even" });
        }
        if (url === "/user/setting/default_academic_year") {
          return Promise.resolve({ data: "2024-25" });
        }
        return Promise.reject(new Error("Not found"));
      });

      act(() => {
        window.dispatchEvent(new Event("focus"));
      });

      await waitFor(() => {
        expect(queryClient.getQueryData(["semester"])).toBe("even");
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
