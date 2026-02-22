// Calculate attendance statistics
// src/utils/bunk.ts

// When bunkableExact is in (0, BORDERLINE_THRESHOLD), the user is technically
// above the target but cannot safely skip even a single class yet.
//
// Why 0.9 rather than 1.0 or (1 - PERCENTAGE_EPSILON)?
// This is a deliberate UX decision: we only surface the "borderline" warning
// for users who have very little headroom (< 90% of a skip unit). A user who
// already has 0.9–0.99 of a skip unit is close enough to "almost there" that
// the borderline label would feel confusing — so we suppress it and let them
// see canBunk=0 with no additional marker. The 0.9 cutoff gives a 10% dead-zone
// between "borderline" and "nearly able to skip". Adjust only with a UX review.
const BORDERLINE_THRESHOLD = 0.9;

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

  if (Math.abs(currentPercentage - safeTarget) < PERCENTAGE_EPSILON) {
    result.isExact = true;
    return result;
  }
  if (currentPercentage < safeTarget) {
    if (safeTarget >= 100) {
      result.requiredToAttend = total - present;
    } else {
      const required = Math.ceil(
        (safeTarget * total - 100 * present) / (100 - safeTarget)
      );
      result.requiredToAttend = Math.max(0, required);
    }
    return result;
  } else if (currentPercentage > safeTarget) {
    const bunkableExact = (100 * present - safeTarget * total) / safeTarget;
    const bunkable = Math.floor(bunkableExact);
    
    result.canBunk = Math.max(0, bunkable);
    
    if (bunkableExact > 0 && bunkableExact < BORDERLINE_THRESHOLD && bunkable === 0) {
      result.isBorderline = true;
    }
    
    return result;
  }

  return result;
}
