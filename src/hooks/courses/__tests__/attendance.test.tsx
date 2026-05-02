import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAttendanceReport, useCourseDetails, useAllCourseDetails } from "../attendance";
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

describe("attendance hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(axios.post).toHaveBeenCalledWith("/attendancereports/student/detailed", {
        semester: "1",
        year: "2023",
      });
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
      const { result } = renderHook(() => useCourseDetails("CUSTOM", 0, "Custom Course"), {
        wrapper: createWrapper(),
      });

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
      expect(axios.get).toHaveBeenCalledWith("/attendancereports/institutionuser/courses/456/summery");
      expect(axios.get).toHaveBeenCalledWith("/attendancereports/institutionuser/courses/456/summary");
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
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useAllCourseDetails(courses), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.CS101.percentage).toBe(90);
      expect(result.current.data?.CS102.total).toBe(20);

      // Check if individual cache was updated
      expect(setQueryDataSpy).toHaveBeenCalledWith(["attendance-report", "CS101"], expect.any(Object));
      expect(setQueryDataSpy).toHaveBeenCalledWith(["attendance-report", "CS102"], expect.any(Object));
    });

    it("should handle missing course in batch courses list", async () => {
       const mockBatchData = {
         UNKNOWN: { total: 10, percentage: 90 },
       };
       (axios.post as any).mockResolvedValueOnce({ data: mockBatchData });
       const { result } = renderHook(() => useAllCourseDetails([{ code: "CS101", id: 1, name: "N" }]), {
         wrapper: createWrapper(),
       });
       await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("should throw if batch response is empty", async () => {
       (axios.post as any).mockResolvedValueOnce({ data: null });
       const { result } = renderHook(() => useAllCourseDetails([{ code: "X", id: 1, name: "X" }]), {
         wrapper: createWrapper(),
       });
       await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
