const _borderlineThreshold = 0.9;
const _percentageEpsilon = 1e-9;

/// AttendanceResult
/// ----------------
/// Encapsulates the results of a "bunk calculator" operation, indicating
/// how many classes can be missed or need to be attended to reach a target.
class AttendanceResult {
  final int canBunk;
  final int requiredToAttend;
  final double targetPercentage;
  final bool isExact;
  final bool isBorderline;

  const AttendanceResult({
    required this.canBunk,
    required this.requiredToAttend,
    required this.targetPercentage,
    required this.isExact,
    required this.isBorderline,
  });
}

/// Calculates the number of classes a user can miss (bunk) or needs to attend
/// to reach a specific target attendance percentage.
AttendanceResult calculateAttendance(
  int present,
  int total, {
  double targetPercentage = 75,
}) {
  final safeTarget = targetPercentage.isFinite
      ? targetPercentage.clamp(1, 100).toDouble()
      : 75.0;

  if (total <= 0 || present < 0 || present > total) {
    return AttendanceResult(
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: safeTarget,
      isExact: false,
      isBorderline: false,
    );
  }

  final currentPercentage = (present / total) * 100;

  if ((currentPercentage - safeTarget).abs() < _percentageEpsilon) {
    return AttendanceResult(
      canBunk: 0,
      requiredToAttend: 0,
      targetPercentage: safeTarget,
      isExact: true,
      isBorderline: false,
    );
  }

  if (currentPercentage < safeTarget) {
    if (safeTarget >= 100) {
      // Impossible to reach 100% if missed any class
      return AttendanceResult(
        canBunk: 0,
        requiredToAttend: 999,
        targetPercentage: safeTarget,
        isExact: false,
        isBorderline: false,
      );
    }
    final required =
        ((safeTarget * total - 100 * present) / (100 - safeTarget)).ceil();
    return AttendanceResult(
      canBunk: 0,
      requiredToAttend: required < 0 ? 0 : required,
      targetPercentage: safeTarget,
      isExact: false,
      isBorderline: false,
    );
  }

  final bunkableExact = (100 * present - safeTarget * total) / safeTarget;
  final bunkable = bunkableExact.floor();
  return AttendanceResult(
    canBunk: bunkable < 0 ? 0 : bunkable,
    requiredToAttend: 0,
    targetPercentage: safeTarget,
    isExact: false,
    isBorderline:
        bunkableExact > 0 &&
        bunkableExact < _borderlineThreshold &&
        bunkable == 0,
  );
}
