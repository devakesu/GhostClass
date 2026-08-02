import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLeaveAttendanceDetails,
  fetchLeaveData,
} from "../ezygo-leave-fetcher";
import { fetchEzygoData } from "../ezygo-batch-fetcher";
import { logger } from "../logger";

vi.mock("../ezygo-batch-fetcher", () => ({
  fetchEzygoData: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("ezygo-leave-fetcher", () => {
  const token = "test-token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchLeaveData", () => {
    it("successfully fetches all leave data", async () => {
      vi.mocked(fetchEzygoData).mockImplementation(async (url) => {
        if (url === "/studentleaves") return { student_leaves: [1] };
        if (url === "/usersubgroups") return [2];
        if (url === "/attendancetypes") return [3];
        if (url === "/sessions") return [4];
        if (url === "/events") return [5];
        if (url === "/institution/setting/mandatory_event_coordinator") {
          return [6];
        }
        if (url === "/institution/setting/student_leave_approval_level") {
          return 3;
        }
        return null;
      });

      const result = await fetchLeaveData(token);

      expect(result.studentLeaves).toEqual({ student_leaves: [1] });
      expect(result.userSubgroups).toEqual([2]);
      expect(result.attendanceTypes).toEqual([3]);
      expect(result.sessions).toEqual([4]);
      expect(result.events).toEqual([5]);
      expect(result.mandatoryEventCoordinator).toEqual([6]);
      expect(result.leaveApprovalLevel).toBe(3);
      expect(fetchEzygoData).toHaveBeenCalledTimes(7);
    });

    it("handles total failures and logs all errors", async () => {
      vi.mocked(fetchEzygoData).mockRejectedValue(new Error("Failed"));

      await expect(fetchLeaveData(token)).rejects.toThrow(
        "Failed to fetch leave data: Failed",
      );

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("fetchLeaveAttendanceDetails", () => {
    it("successfully fetches leave attendance details", async () => {
      const mockData = { details: "some-data" };
      vi.mocked(fetchEzygoData).mockResolvedValue(mockData);

      const result = await fetchLeaveAttendanceDetails(
        token,
        "2023-01-01",
        "2023-01-31",
      );

      expect(result).toEqual(mockData);
      expect(fetchEzygoData).toHaveBeenCalledWith(
        "/attendancereports/student/detailed",
        token,
        "POST",
        {
          start_date: "2023-01-01",
          upto_date: "2023-01-31",
          from_student_leave_application: true,
        },
      );
    });

    it("handles fetch failure and logs error", async () => {
      vi.mocked(fetchEzygoData).mockRejectedValue(new Error("Network Error"));

      await expect(
        fetchLeaveAttendanceDetails(token, "2023-01-01", "2023-01-31"),
      ).rejects.toThrow(
        "Failed to fetch leave attendance details: Network Error",
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch leave attendance details"),
        expect.objectContaining({ error: "Error: Network Error" }),
      );
    });
  });
});
