import { describe, expect, it } from "vitest";
import { AVAILABLE_SCENARIOS, getMockResponses } from "../ezygo-scenarios";

describe("ezygo-scenarios", () => {
  it("has available scenarios", () => {
    expect(AVAILABLE_SCENARIOS).toContain("confirmed");
    expect(AVAILABLE_SCENARIOS).toContain("mixed");
  });

  it("returns mock responses for a valid scenario", async () => {
    const responses = getMockResponses("confirmed");
    expect(responses).not.toBeNull();
    if (responses) {
      expect(responses.courses).toBeInstanceOf(Response);
      expect(responses.attendance).toBeInstanceOf(Response);

      const courses = await responses.courses.json();
      expect(Array.isArray(courses)).toBe(true);
      expect(courses.length).toBeGreaterThan(0);

      const attendance = await responses.attendance.json();
      expect(attendance.studentAttendanceData).toBeDefined();
    }
  });

  it("returns null for an invalid scenario", () => {
    const responses = getMockResponses("invalid");
    expect(responses).toBeNull();
  });

  it("returns correct data for the mixed scenario", async () => {
    const responses = getMockResponses("mixed");
    expect(responses).not.toBeNull();
    if (responses) {
      const attendance = await responses.attendance.json();
      expect(attendance.studentAttendanceData["2025-12-31"]).toBeDefined();
    }
  });
});
