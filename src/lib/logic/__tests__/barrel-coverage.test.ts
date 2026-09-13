import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATUS,
  calculateAttendance,
  calculateCurrentAcademicInfo,
  getOfficialSessionRaw,
  getReconciledStats,
  hasAcademicRollover,
  isAbsent,
  isLogicModuleLoaded,
  isPositive,
  semestersDiffer,
  yearsDiffer,
} from "../index";

describe("Logic Barrel Coverage", () => {
  it("executes all exports from the barrel file for complete coverage tracking", () => {
    expect(ATTENDANCE_STATUS).toBeDefined();
    expect(isPositive(110)).toBe(true);
    expect(isAbsent(111)).toBe(true);
    expect(typeof getOfficialSessionRaw).toBe("function");
    expect(typeof getReconciledStats).toBe("function");
    expect(typeof calculateAttendance).toBe("function");
    expect(typeof calculateCurrentAcademicInfo).toBe("function");
    expect(typeof yearsDiffer).toBe("function");
    expect(typeof semestersDiffer).toBe("function");
    expect(typeof hasAcademicRollover).toBe("function");
    expect(isLogicModuleLoaded()).toBe(true);
  });
});
