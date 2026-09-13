import { renderHook, waitFor } from "@testing-library/react";
vi.unmock("@/hooks/courses/attendance");
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetModuleState,
  resetWorkingSummaryEndpoint,
  useAllCourseDetails,
  useAttendanceReport,
  useCourseDetails,
} from "../attendance";
import axios from "@/lib/axios";
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
  retryTwice: false,
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
  const QueryClientWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  QueryClientWrapper.displayName = "QueryClientWrapper";
  return QueryClientWrapper;
};

describe("attendance hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetModuleState();
  });

  describe("useAttendanceReport", () => {
    it("should fetch attendance report", async () => {
      const mockData = { report: "test" };
      (axios.post as any).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useAttendanceReport("1", "2023"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockData);
      expect(axios.post).toHaveBeenCalledWith(
        "/attendancereports/student/detailed",
        {
          semester: "1",
          year: "2023",
        },
      );
    });

    it("should handle fetch error", async () => {
      (axios.post as any).mockRejectedValueOnce(new Error("Fetch failed"));

      const { result } = renderHook(() => useAttendanceReport("1", "2023"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it("should throw if response is null", async () => {
      (axios.post as any).mockResolvedValueOnce(null);

      const { result } = renderHook(() => useAttendanceReport("1", "2023"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useCourseDetails", () => {
    it("should fetch course details with normalization (typo handling)", async () => {
      const mockRawData = {
        totel: 10,
        persantage: 80,
        other: "data",
      };
      (axios.get as any).mockResolvedValueOnce({ data: mockRawData });

      const { result } = renderHook(() => useCourseDetails("CS101", 123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        total: 10,
        percentage: 80,
        other: "data",
      });
    });

    it("should handle alternative misspelled keys (total/percentage)", async () => {
      const mockRawData = {
        total: 15,
        persentage: 75,
      };
      (axios.get as any).mockResolvedValueOnce({ data: mockRawData });

      const { result } = renderHook(() => useCourseDetails("CS101", 123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.total).toBe(15);
      expect(result.current.data?.percentage).toBe(75);
    });

    it("should handle default keys (total/percentage) if misspelled missing", async () => {
      const mockRawData = {
        total: 20,
        percentage: 85,
      };
      (axios.get as any).mockResolvedValueOnce({ data: mockRawData });

      const { result } = renderHook(() => useCourseDetails("CS101", 123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.total).toBe(20);
      expect(result.current.data?.percentage).toBe(85);
    });

    it("should handle missing totel/total/percentage entirely", async () => {
      (axios.get as any).mockResolvedValueOnce({ data: {} });
      const { result } = renderHook(() => useCourseDetails("CS101", 123), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.total).toBeUndefined();
    });

    it("should throw if course detail fetch returns null", async () => {
      (axios.get as any).mockResolvedValueOnce(null);
      const { result } = renderHook(() => useCourseDetails("CS101", 123), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it("should handle custom courses (ezygoId 0)", async () => {
      const { result } = renderHook(
        () => useCourseDetails("CUSTOM", 0, "Custom Course"),
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.course.name).toBe("Custom Course");
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("should use default name for custom courses if not provided", async () => {
      const { result } = renderHook(() => useCourseDetails("CUSTOM", 0), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.course.name).toBe("Course");
    });

    it("should retry with correct endpoint on fallback", async () => {
      // First call fails, second call succeeds
      (axios.get as any)
        .mockRejectedValueOnce(new Error("404 on /summery"))
        .mockResolvedValueOnce({ data: { total: 5, percentage: 100 } });

      const { result } = renderHook(() => useCourseDetails("CS102", 456), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/456/summery",
      );
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/456/summary",
      );
    });

    it("should not lock to /summary when /summery failure is transient (e.g. 502)", async () => {
      // First call encounters a 502 Bad Gateway
      const transientErr = new Error("Bad Gateway");
      (transientErr as any).response = { status: 502 };

      (axios.get as any)
        .mockRejectedValueOnce(transientErr)
        .mockResolvedValueOnce({ data: { total: 5, percentage: 100 } });

      const wrapper = createWrapper();
      const { result: firstResult } = renderHook(
        () => useCourseDetails("CS102", 456),
        { wrapper },
      );

      await waitFor(() => expect(firstResult.current.isSuccess).toBe(true));
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/456/summery",
      );
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/456/summary",
      );

      vi.clearAllMocks();

      // Subsequent call should STILL attempt /summery first because previous error was transient
      (axios.get as any).mockResolvedValueOnce({
        data: { total: 10, percentage: 90 },
      });

      const { result: secondResult } = renderHook(
        () => useCourseDetails("CS103", 789),
        { wrapper },
      );

      await waitFor(() => expect(secondResult.current.isSuccess).toBe(true));
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/789/summery",
      );
    });

    it("should lock to /summary when /summery failure is 404 Not Found", async () => {
      const notFoundErr = new Error("Not Found");
      (notFoundErr as any).response = { status: 404 };

      (axios.get as any)
        .mockRejectedValueOnce(notFoundErr)
        .mockResolvedValueOnce({ data: { total: 5, percentage: 100 } });

      const wrapper = createWrapper();
      const { result: firstResult } = renderHook(
        () => useCourseDetails("CS102", 456),
        { wrapper },
      );

      await waitFor(() => expect(firstResult.current.isSuccess).toBe(true));

      vi.clearAllMocks();

      // Subsequent call should skip /summery and directly use cached /summary
      (axios.get as any).mockResolvedValueOnce({
        data: { total: 10, percentage: 90 },
      });

      const { result: secondResult } = renderHook(
        () => useCourseDetails("CS103", 789),
        { wrapper },
      );

      await waitFor(() => expect(secondResult.current.isSuccess).toBe(true));
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/789/summary",
      );
    });

    it("should scope cached endpoints per institution key", async () => {
      const notFoundErr = new Error("Not Found");
      (notFoundErr as any).response = { status: 404 };

      // Institution "instA" has 404 on /summery -> caches /summary
      (axios.get as any)
        .mockRejectedValueOnce(notFoundErr)
        .mockResolvedValueOnce({ data: { total: 5, percentage: 100 } });

      const wrapper = createWrapper();
      const { result: instAResult } = renderHook(
        () =>
          useCourseDetails("CS102", 456, undefined, {
            institutionKey: "instA",
          }),
        { wrapper },
      );

      await waitFor(() => expect(instAResult.current.isSuccess).toBe(true));

      vi.clearAllMocks();

      // Institution "instB" should NOT be polluted by instA and should try /summery first
      (axios.get as any).mockResolvedValueOnce({
        data: { total: 12, percentage: 85 },
      });

      const { result: instBResult } = renderHook(
        () =>
          useCourseDetails("CS104", 999, undefined, {
            institutionKey: "instB",
          }),
        { wrapper },
      );

      await waitFor(() => expect(instBResult.current.isSuccess).toBe(true));
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/999/summery",
      );
    });

    it("should reset cached endpoint when resetWorkingSummaryEndpoint is called", async () => {
      const notFoundErr = new Error("Not Found");
      (notFoundErr as any).response = { status: 404 };

      (axios.get as any)
        .mockRejectedValueOnce(notFoundErr)
        .mockResolvedValueOnce({ data: { total: 5, percentage: 100 } });

      const wrapper = createWrapper();
      const { result: firstResult } = renderHook(
        () => useCourseDetails("CS102", 456),
        { wrapper },
      );

      await waitFor(() => expect(firstResult.current.isSuccess).toBe(true));

      // Reset endpoint cache
      resetWorkingSummaryEndpoint();
      vi.clearAllMocks();

      (axios.get as any).mockResolvedValueOnce({
        data: { total: 10, percentage: 90 },
      });

      const { result: secondResult } = renderHook(
        () => useCourseDetails("CS103", 789),
        { wrapper },
      );

      await waitFor(() => expect(secondResult.current.isSuccess).toBe(true));
      // Should attempt /summery again after reset
      expect(axios.get).toHaveBeenCalledWith(
        "/attendancereports/institutionuser/courses/789/summery",
      );
    });
  });

  describe("useAllCourseDetails", () => {
    it("should batch fetch all course details and update cache", async () => {
      const courses = [
        { code: "CS101", id: 123, name: "Intro" },
        { code: "CS102", id: 456, name: "Advanced" },
      ];
      const mockBatchData = {
        CS101: { totel: 10, persantage: 90 },
        CS102: { total: 20, percentage: 80 },
      };
      (axios.post as any).mockResolvedValueOnce({ data: mockBatchData });

      const queryClient = new QueryClient();
      const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useAllCourseDetails(courses), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.CS101.percentage).toBe(90);
      expect(result.current.data?.CS102.total).toBe(20);

      // Check if individual cache was updated
      expect(setQueryDataSpy).toHaveBeenCalledWith([
        "attendance-report",
        "CS101",
        123,
      ], expect.any(Object));
      expect(setQueryDataSpy).toHaveBeenCalledWith([
        "attendance-report",
        "CS102",
        456,
      ], expect.any(Object));
    });

    it("should normalize cache keys for courses with spaces and hyphens", async () => {
      const courses = [
        { code: "CS-101 2", id: 123, name: "Intro" },
      ];
      const mockBatchData = {
        "CS-101 2": { totel: 10, persantage: 90 },
      };
      (axios.post as any).mockResolvedValueOnce({ data: mockBatchData });

      const queryClient = new QueryClient();
      const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useAllCourseDetails(courses), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The cached key should be normalized (uppercase, spaces and hyphens removed)
      expect(setQueryDataSpy).toHaveBeenCalledWith([
        "attendance-report",
        "CS1012",
        123,
      ], expect.any(Object));
    });

    it("should handle missing course in batch courses list", async () => {
      const mockBatchData = {
        UNKNOWN: { total: 10, percentage: 90 },
      };
      (axios.post as any).mockResolvedValueOnce({ data: mockBatchData });
      const { result } = renderHook(
        () => useAllCourseDetails([{ code: "CS101", id: 1, name: "N" }]),
        {
          wrapper: createWrapper(),
        },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("should throw if batch response is empty", async () => {
      (axios.post as any).mockResolvedValueOnce({ data: null });
      const { result } = renderHook(
        () => useAllCourseDetails([{ code: "X", id: 1, name: "X" }]),
        {
          wrapper: createWrapper(),
        },
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
