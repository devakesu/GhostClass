import { describe, it, expect } from "vitest";
import { calculateAttendance } from "../bunk";

describe("calculateAttendance", () => {
  it("returns default results for invalid inputs", () => {
    expect(calculateAttendance(0, 0)).toEqual({
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: 75,
      isExact: false,
      isBorderline: false,
    });
    expect(calculateAttendance(-1, 10)).toEqual({
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: 75,
      isExact: false,
      isBorderline: false,
    });
    expect(calculateAttendance(11, 10)).toEqual({
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: 75,
      isExact: false,
      isBorderline: false,
    });
  });

  it("handles exactly target percentage", () => {
    const result = calculateAttendance(75, 100, 75);
    expect(result.isExact).toBe(true);
    expect(result.canBunk).toBe(0);
    expect(result.requiredToAttend).toBe(0);
  });

  it("calculates classes required to attend when below target", () => {
    // 50/100 = 50%. Need 75%.
    // (75*100 - 100*50) / (100-75) = (7500 - 5000) / 25 = 2500 / 25 = 100.
    // Wait, let's check the formula: (75 * 100 - 100 * 50) / (100 - 75) = 2500 / 25 = 100.
    // If I attend 100 more, I have 150/200 = 75%. Correct.
    const result = calculateAttendance(50, 100, 75);
    expect(result.requiredToAttend).toBe(100);
    expect(result.canBunk).toBe(0);
  });

  it("handles 100% target separately", () => {
    const result = calculateAttendance(90, 100, 100);
    expect(result.requiredToAttend).toBe(10);
  });

  it("calculates classes able to bunk when above target", () => {
    // 80/100 = 80%. Target 75%.
    // (100*80 - 75*100) / 75 = (8000 - 7500) / 75 = 500 / 75 = 6.66...
    // floor(6.66) = 6.
    const result = calculateAttendance(80, 100, 75);
    expect(result.canBunk).toBe(6);
    expect(result.isBorderline).toBe(false);
  });

  it("detects borderline state", () => {
    // Target 75. Need very slightly more than 75 to be borderline skip.
    // If we have 75.1 / 100. (Not possible with integers but let's see).
    // If present=76, total=101. 76/101 = 75.24%.
    // bunkableExact = (100*76 - 75*101) / 75 = (7600 - 7575) / 75 = 25 / 75 = 0.33...
    // 0.33 is < 0.9.
    const result = calculateAttendance(76, 101, 75);
    expect(result.canBunk).toBe(0);
    expect(result.isBorderline).toBe(true);
  });

  it("should handle invalid inputs", () => {
    expect(calculateAttendance(-1, 10).canBunk).toBe(0);
    expect(calculateAttendance(11, 10).canBunk).toBe(0);
    expect(calculateAttendance(10, 0).canBunk).toBe(0);
  });

  it("should handle non-finite target percentage", () => {
    expect(calculateAttendance(10, 10, Infinity).targetPercentage).toBe(75);
    expect(calculateAttendance(10, 10, -Infinity).targetPercentage).toBe(75);
  });

  it("should handle 100% target percentage", () => {
    const result = calculateAttendance(8, 10, 100);
    expect(result.requiredToAttend).toBe(2);
  });

  it("should identify borderline attendance", () => {
    // 75% target. 10 total. 7.6 present.
    // bunkableExact = (100 * 7.6 - 75 * 10) / 75 = (760 - 750) / 75 = 10 / 75 = 0.133
    // 0 < 0.133 < 0.9. bunkable = 0.
    // To get 7.6 present in integers, we need to scale up.
    // (100 * P - 75 * T) / 75 = 0.5
    // 100P - 75T = 37.5
    // Let T = 100. 100P - 7500 = 37.5. 100P = 7537.5. Still not integer.
    // Let's use T=4. P=3. 100*3 - 75*4 = 0.
    // If P=3.1 (scaled).
    // Let's try T=40. P=30. (100*30 - 75*40)/75 = 0.
    // If P=30.5 -> (3050 - 3000)/75 = 50/75 = 0.66
    // Since we need integers:
    // T=4, P=3 -> 75% exactly.
    // T=40, P=31 -> (3100 - 3000)/75 = 1.33 (can bunk 1).
    // We want 0 < bunkableExact < 0.9.
    // Let's try T=10, P=8 -> (800 - 750)/75 = 50/75 = 0.66. (Borderline!)
    const result = calculateAttendance(8, 10, 75);
    expect(result.isBorderline).toBe(true);
    expect(result.canBunk).toBe(0);
  });

  it("handles invalid targetPercentage by defaulting to 75", () => {
    expect(calculateAttendance(75, 100, NaN).targetPercentage).toBe(75);
    expect(calculateAttendance(75, 100, 150).targetPercentage).toBe(100);
    expect(calculateAttendance(75, 100, -10).targetPercentage).toBe(1);
  });
});
