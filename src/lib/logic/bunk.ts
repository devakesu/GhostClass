// Calculate attendance statistics
// src/utils/bunk.ts

// src/utils/bunk.ts

// Epsilon for floating-point equality: (present/total)*100 is an IEEE 754 double
// and can diverge from a round target by a tiny amount (e.g. 75.00000000000001).
// Values within this band are treated as mathematically exact.
const PERCENTAGE_EPSILON = 1e-9;

export interface AttendanceResult {
  canBunk: number;
  requiredToAttend: number;
  targetPercentage: number;
  /** True only when current attendance percentage exactly equals the safe target (clamped between 1–100). */
  isExact: boolean;
  /** True when slightly above the target but not enough to skip a full class. */
  isBorderline: boolean;
}

export function calculateAttendance(
  present: number,
  total: number,
  targetPercentage: number = 75
): AttendanceResult {
  const safeTarget = Number.isFinite(targetPercentage)
    ? Math.min(100, Math.max(1, targetPercentage))
    : 75;

  if (total <= 0 || present < 0 || present > total) {
    return {
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: safeTarget,
      isExact: false,
      isBorderline: false,
    };
  }

  const currentPercentage = (present / total) * 100;

  if (Math.abs(currentPercentage - safeTarget) < PERCENTAGE_EPSILON) {
    return {
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: safeTarget,
      isExact: true,
      isBorderline: false,
    };
  }

  if (currentPercentage < safeTarget) {
    if (safeTarget >= 100) {
      // Impossible to reach 100% if missed any class
      return {
        canBunk: 0,
        requiredToAttend: 999,
        targetPercentage: safeTarget,
        isExact: false,
        isBorderline: false,
      };
    }
    const required = Math.ceil(
      (safeTarget * total - 100 * present) / (100 - safeTarget)
    );
    return {
      canBunk: 0,
      requiredToAttend: required < 0 ? 0 : required,
      targetPercentage: safeTarget,
      isExact: false,
      isBorderline: false,
    };
  }

  const bunkableExact = (100 * present - safeTarget * total) / safeTarget;
  const bunkable = Math.floor(bunkableExact);
  return {
    canBunk: bunkable < 0 ? 0 : bunkable,
    requiredToAttend: 0,
    targetPercentage: safeTarget,
    isExact: false,
    isBorderline:
      bunkableExact > 0 &&
      bunkableExact < 0.9 &&
      bunkable === 0,
  };
}
