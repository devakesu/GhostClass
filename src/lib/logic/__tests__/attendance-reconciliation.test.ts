import { describe, it, expect } from "vitest";
import { getReconciledStats, isLegacyRemark, isPositive, isAbsent, getOfficialSessionRaw } from "../attendance-reconciliation";
import { ATTENDANCE_STATUS } from "../attendance-reconciliation";

describe("Attendance Reconciliation Logic", () => {
  describe("isLegacyRemark", () => {
    it("returns true for empty or placeholder remarks", () => {
      expect(isLegacyRemark("")).toBe(true);
      expect(isLegacyRemark(null)).toBe(true);
      expect(isLegacyRemark("Duty Leave")).toBe(true);
      expect(isLegacyRemark("Self-Marked: Present")).toBe(true);
    });

    it("returns false for custom remarks", () => {
      expect(isLegacyRemark("Participated in Tech Fest")).toBe(false);
    });
  });

  describe("Status Checks", () => {
    it("identifies positive status (Present or DL)", () => {
      expect(isPositive(ATTENDANCE_STATUS.PRESENT)).toBe(true);
      expect(isPositive(ATTENDANCE_STATUS.DUTY_LEAVE)).toBe(true);
      expect(isPositive(ATTENDANCE_STATUS.ABSENT)).toBe(false);
    });

    it("identifies absent status", () => {
      expect(isAbsent(ATTENDANCE_STATUS.ABSENT)).toBe(true);
      expect(isAbsent(0)).toBe(false);
    });
  });

  describe("getReconciledStats", () => {
    const courseId = "course-123";
    const defaultAggregate = { present: 10, absent: 2, total: 12 };

    it("uses aggregate fallback when sessions are missing", () => {
      const stats = getReconciledStats(courseId, defaultAggregate, undefined, undefined);
      expect(stats.realPresent).toBe(10);
      expect(stats.realTotal).toBe(12);
      expect(stats.officialPercentage).toBe(83.33);
    });

    it("reconciles corrections (Official Absent -> Tracker Present)", () => {
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.ABSENT }
      ];
      const tracking = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, status: "normal" }
      ];

      const stats = getReconciledStats(courseId, { present: 0, absent: 1, total: 1 }, sessions, tracking as any);
      
      expect(stats.realPresent).toBe(0);
      expect(stats.correctionPresent).toBe(1);
      expect(stats.finalPresent).toBe(1);
      expect(stats.savedAbsent).toBe(1);
    });

    it("handles extra DL sessions", () => {
      const courseId = "course-123";
      const tracking = [
        { course: courseId, date: "2024-01-02", session: 1, attendance: ATTENDANCE_STATUS.DUTY_LEAVE, status: "extra" }
      ];
      // No sessions, so it's extra
      const stats = getReconciledStats(courseId, { present: 0, absent: 0, total: 0 }, [], tracking as any);
      expect(stats.extraDL).toBe(1);
      expect(stats.extraPresent).toBe(1);
      expect(stats.extrasCount).toBe(1);
    });

    it("ignores official present sessions in reconciliation loop", () => {
      const courseId = "course-123";
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT }
      ];
      const tracking = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.ABSENT, status: "normal" }
      ];
      const stats = getReconciledStats(courseId, { present: 1, absent: 0, total: 1 }, sessions, tracking as any);
      expect(stats.correctionPresent).toBe(0);
      expect(stats.finalPresent).toBe(1);
    });

    it("handles correction DL sessions", () => {
      const courseId = "course-123";
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.ABSENT }
      ];
      const tracking = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.DUTY_LEAVE, status: "normal" }
      ];
      const stats = getReconciledStats(courseId, { present: 0, absent: 1, total: 1 }, sessions, tracking as any);
      expect(stats.correctionDL).toBe(1);
      expect(stats.correctionPresent).toBe(1);
    });

    it("handles missing official session data gracefully", () => {
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT }
      ];
      const tracking = [
        { course: courseId, date: "2024-01-02", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, status: "extra" }
      ];

      const stats = getReconciledStats(courseId, { present: 1, absent: 0, total: 1 }, sessions, tracking as any);
      
      expect(stats.realTotal).toBe(1);
      expect(stats.extrasCount).toBe(1);
      expect(stats.extraPresent).toBe(1);
      expect(stats.finalTotal).toBe(2);
      expect(stats.finalPresent).toBe(2);
    });

    it("ignores 'Revision' sessions", () => {
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, class_type: "Revision" }
      ];
      const stats = getReconciledStats(courseId, { present: 1, absent: 0, total: 1 }, sessions, undefined);
      expect(stats.realTotal).toBe(0);
    });

    it("ignores tracking data for other courses", () => {
      const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.ABSENT }
      ];
      const tracking = [
        { course: "other-course", date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, status: "normal" }
      ];

      const stats = getReconciledStats(courseId, { present: 0, absent: 1, total: 1 }, sessions, tracking as any);
      expect(stats.correctionPresent).toBe(0);
      expect(stats.finalPresent).toBe(0);
    });

    it("handles extra absent sessions correctly", () => {
      const tracking = [
        { course: courseId, date: "2024-01-02", session: 1, attendance: ATTENDANCE_STATUS.ABSENT, status: "extra" }
      ];

      const stats = getReconciledStats(courseId, { present: 0, absent: 0, total: 0 }, undefined, tracking as any);
      
      expect(stats.extrasCount).toBe(1);
      expect(stats.extraAbsent).toBe(1);
      expect(stats.extraPresent).toBe(0);
      expect(stats.finalTotal).toBe(1);
      expect(stats.finalPresent).toBe(0);
    });

    it("handles non-finite attendance code in tracking", () => {
      const tracking = [
        { course: courseId, date: "2024-01-02", session: 1, attendance: "not-a-number", status: "extra" }
      ];
      const stats = getReconciledStats(courseId, { present: 0, absent: 0, total: 0 }, undefined, tracking as any);
      expect(stats.extrasCount).toBe(0); // Should skip non-finite
    });

    it("handles branch where officialStatus is undefined in else if", () => {
      // Line 163: else if (officialStatus !== undefined)
      // We want isTrulyExtra=false AND officialStatus=undefined
      const tracking = [
        { course: courseId, date: "2024-01-02", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, status: "normal" }
      ];
      // officialSessions empty -> officialStatus undefined
      // status: "normal" -> isTrulyExtra false
      const stats = getReconciledStats(courseId, { present: 0, absent: 0, total: 0 }, [], tracking as any);
      expect(stats.extrasCount).toBe(0);
    });

    it("hits correction else branches", () => {
       const sessions = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT }
      ];
      const tracking = [
        { course: courseId, date: "2024-01-01", session: 1, attendance: ATTENDANCE_STATUS.PRESENT, status: "normal" }
      ];
      // offPos=true, trackPos=true -> hits 'if (offPos) return' at line 165
      const stats = getReconciledStats(courseId, { present: 1, absent: 0, total: 1 }, sessions, tracking as any);
      expect(stats.correctionPresent).toBe(0);
    });
  });

  describe("getOfficialSessionRaw", () => {
    it("returns session if provided and valid", () => {
      expect(getOfficialSessionRaw({ session: 123 }, "key")).toBe(123);
      expect(getOfficialSessionRaw({ session: "s1" }, "key")).toBe("s1");
    });

    it("returns sessionKey if session is missing, null, or empty", () => {
      expect(getOfficialSessionRaw(null, "key")).toBe("key");
      expect(getOfficialSessionRaw(undefined, "key")).toBe("key");
      expect(getOfficialSessionRaw({ session: null }, "key")).toBe("key");
      expect(getOfficialSessionRaw({ session: "" }, "key")).toBe("key");
    });

    it("should ignore Revision classes and classes from other courses", () => {
      const sessions = [
        { course: "target", date: "2023-01-01", session: 1, attendance: 110 },
        { course: "target", date: "2023-01-01", session: 2, attendance: 110, class_type: "Revision" },
        { course: "other", date: "2023-01-01", session: 1, attendance: 110 }
      ];
      const stats = getReconciledStats("target", { present: 0, absent: 0, total: 0 }, sessions, []);
      expect(stats.realTotal).toBe(1);
    });

    it("should track Duty Leave and Other Leave in real stats", () => {
      const sessions = [
        { course: "target", date: "2023-01-01", session: 1, attendance: 225 }, // DL
        { course: "target", date: "2023-01-01", session: 2, attendance: 112 }  // Other
      ];
      const stats = getReconciledStats("target", { present: 0, absent: 0, total: 0 }, sessions, []);
      expect(stats.realDL).toBe(1);
      expect(stats.realOther).toBe(1);
      expect(stats.realPresent).toBe(1); // DL is positive
    });

    it("should handle tracker corrections for absent official sessions", () => {
        const sessions = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 111 } // Absent
        ];
        const tracks = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 110 } // Tracker Present
        ];
        const stats = getReconciledStats("target", { present: 0, absent: 1, total: 1 }, sessions, tracks as any);
        expect(stats.correctionPresent).toBe(1);
        expect(stats.savedAbsent).toBe(1);
        expect(stats.finalPresent).toBe(1);
    });

    it("should handle tracker DL correction for absent official sessions", () => {
        const sessions = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 111 } // Absent
        ];
        const tracks = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 225 } // Tracker DL
        ];
        const stats = getReconciledStats("target", { present: 0, absent: 1, total: 1 }, sessions, tracks as any);
        expect(stats.correctionPresent).toBe(1);
        expect(stats.correctionDL).toBe(1);
    });

    it("should identify Self-Marked legacy remarks", () => {
        expect(isLegacyRemark("Self-Marked: Anything")).toBe(true);
        expect(isLegacyRemark("Normal remark")).toBe(false);
    });

    it("should handle tracker ABSENT for official ABSENT sessions", () => {
        const sessions = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 111 } // Absent
        ];
        const tracks = [
            { course: "target", date: "2023-01-01", session: 1, attendance: 111 } // Tracker Absent
        ];
        const stats = getReconciledStats("target", { present: 0, absent: 1, total: 1 }, sessions, tracks as any);
        expect(stats.correctionPresent).toBe(0);
        expect(stats.finalPresent).toBe(0);
    });
  });
});
