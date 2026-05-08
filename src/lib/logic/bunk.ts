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
  const result: AttendanceResult = {
    canBunk: 0,
    requiredToAttend: 0,
    targetPercentage: safeTarget,
    isExact: false,
    isBorderline: false,
  };

  if (total <= 0 || present < 0 || present > total) {
    return result;
  }

  const currentPercentage = (present / total) * 100;

  if (currentPercentage < safeTarget - PERCENTAGE_EPSILON) {
    if (safeTarget >= 100) {
      result.requiredToAttend = total - present;
    } else {
      const required = Math.ceil(
        (safeTarget * total - 100 * present) / (100 - safeTarget)
      );
      result.requiredToAttend = Math.max(0, required);
    }
  } else {
    // currentPercentage >= safeTarget (within epsilon)
    const bunkableExact = (100 * present - safeTarget * total) / safeTarget;
    const bunkable = Math.floor(bunkableExact + PERCENTAGE_EPSILON);
    
    result.canBunk = Math.max(0, bunkable);
    
    // "Edge/Borderline" case: Above target but cannot skip a full class yet
    if (result.canBunk === 0) {
      result.isBorderline = true;
      if (Math.abs(currentPercentage - safeTarget) < PERCENTAGE_EPSILON) {
        result.isExact = true;
      }
    }
  }

  return result;
}
