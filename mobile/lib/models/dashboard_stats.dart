import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;

class DashboardStats {
  final int percentage;
  final double rawPercentage;
  final int officialPercentage;
  final double rawOfficialPercentage;

  // Present components
  final int officialPresent;
  final int corrPresent;
  final int extraPresent;
  final int finalPresent;

  // Absent components
  final int officialAbsent;
  final int savedAbsent;
  final int extraAbsent;
  final int finalAbsent;

  // Total components
  final int officialTotal;
  final int finalTotal;
  final int manualTotalGain;

  // Leave components
  final int officialDL;
  final int corrDL;
  final int extraDL;
  final int dlCount;
  final int specialLeaveCount;

  // Course components
  final int activeCourses;
  final int totalCoursesCount;

  final Map<String, CourseStat> courseStats;

  final List<SuspiciousAbsence> suspiciousAbsences;

  DashboardStats({
    required this.percentage,
    required this.rawPercentage,
    required this.officialPercentage,
    required this.rawOfficialPercentage,
    required this.officialPresent,
    required this.corrPresent,
    required this.extraPresent,
    required this.finalPresent,
    required this.officialAbsent,
    required this.savedAbsent,
    required this.extraAbsent,
    required this.finalAbsent,
    required this.officialTotal,
    required this.finalTotal,
    required this.manualTotalGain,
    required this.officialDL,
    required this.corrDL,
    required this.extraDL,
    required this.dlCount,
    required this.specialLeaveCount,
    required this.activeCourses,
    required this.totalCoursesCount,
    required this.courseStats,
    this.suspiciousAbsences = const [],
  });

  factory DashboardStats.calculate({
    required AttendanceReportDetailed attendanceData,
    required List<TrackingRecord> trackingRecords,
    required String selectedSemester,
    required String selectedYear,
    Set<String> disabledCourseCodes = const <String>{},
    List<CourseDetails>? allCourses,
  }) {
    int officialPresent = 0;
    int officialAbsent = 0;
    int officialDL = 0;
    int officialOther = 0;
    int officialTotal = 0;

    int corrPresent = 0;
    int savedAbsent = 0;
    int corrDL = 0;
    int extraPresent = 0;
    int extraAbsent = 0;
    int extraDL = 0;

    final Map<String, CourseStat> courseStats = {};

    // --- 1. Robust Identity Resolution System (Web Parity) ---
    // Standardizes ID/Code/Name into a consistent Match Key.
    // Replicates Web's formatCourseCode: splits at hyphens and removes all spaces.

    final Map<String, String> lookupMap = {}; // StandardizedCode -> SafeId
    final Map<String, String> idToSafeId = {}; // NumericID -> SafeId
    final Set<String> catalogCodesSet = {}; // For denominator filtering

    if (allCourses != null) {
      for (final course in allCourses) {
        final String safeId = course.safeId;
        final String stdCode = standardize(course.code ?? course.id.toString());

        catalogCodesSet.add(stdCode);
        courseStats.putIfAbsent(
          safeId,
          () => CourseStat(
            id: safeId,
            code: stdCode,
            name: course.name,
          ),
        );

        idToSafeId[course.id.toString()] = safeId;
        lookupMap[stdCode] = safeId;
      }
    }

    String resolveSafeId(String input) {
      final String raw = input.trim();
      final String std = standardize(raw);
      if (lookupMap.containsKey(std)) return lookupMap[std]!;
      if (idToSafeId.containsKey(raw)) return idToSafeId[raw]!;
      return raw;
    }

    // --- 2. Process Official Data ---
    final Map<String, int> officialMap = {};
    final List<SuspiciousAbsence> suspiciousAbsences = [];

    attendanceData.studentAttendanceData.forEach((date, dailySessions) {
      final List<String> presentCourses = [];
      final List<Map<String, dynamic>> absentSessions = [];

      dailySessions.forEach((sessionKey, session) {
        if (session.course != null && session.classType != 'Revision') {
          final String rawCid = session.course.toString();
          final String cid = resolveSafeId(rawCid);

          final int status = _parseStatus(session.attendance);
          final String rawCourseCode =
              attendanceData.courses[rawCid]?.code ?? rawCid;
          final String stdCourseCode = standardize(rawCourseCode);
          final bool courseDisabled = disabledCourseCodes.contains(
            stdCourseCode,
          );

          // Web Parity: Only specific codes count toward official stats
          final bool isPos = [110, 225, 112].contains(status);
          final bool isNeg = status == 111;
          final bool isValid = isPos || isNeg;

          if (isValid) {
            // Standardize Slot Key Format: {StandardizedCode}_{YYYYMMDD}_{SESSION_ROMAN}
            final String normalizedDate = utils.normalizeDate(date);
            final String normalizedSessionNum = utils.normalizeSession(
              session.session ?? sessionKey,
            );
            final String key =
                "${rawCid}_${normalizedDate}_${normalizedSessionNum.toUpperCase()}";

            officialMap[key] = status;

            CourseStat? course = courseStats[cid];
            if (course == null) {
              final String name = attendanceData.courses[rawCid]?.name ?? rawCid;
              course = CourseStat(id: cid, code: stdCourseCode, name: name);
              courseStats[cid] = course;
            }

            course.officialTotal++;
            course.finalTotal++;
              // Note: For per-course stats, we use the stricter _isPositive (110, 225)
              if (_isPositive(status, includeOtherLeave: false)) {
                course.officialPresent++;
                course.finalPresent++;
              }

              if (catalogCodesSet.contains(stdCourseCode) && !courseDisabled) {
              officialTotal++;
              // Dashboard Overview Parity: Present counter includes 112 (Other Leave)
              if (_isPositive(status, includeOtherLeave: true)) {
                officialPresent++;
              } else {
                officialAbsent++;
              }
              if (status == 225) officialDL++;
              if (status == 112) officialOther++;

              // For Suspicious Absence Detection
              if (_isPositive(status, includeOtherLeave: false)) {
                presentCourses.add(
                  attendanceData.courses[rawCid]?.name ?? rawCid,
                );
              } else if (status == 111) {
                absentSessions.add({
                  'courseId': rawCid,
                  'courseName': attendanceData.courses[rawCid]?.name ?? rawCid,
                  'session': session.session ?? sessionKey,
                });
              }
            }
          }
        }
      });

      // If marked absent in something but present in something else on the SAME day
      if (absentSessions.isNotEmpty && presentCourses.isNotEmpty) {
        for (var abs in absentSessions) {
          suspiciousAbsences.add(SuspiciousAbsence(
            date: date,
            courseId: abs['courseId'] as String,
            courseName: abs['courseName'] as String,
            session: abs['session'].toString(),
            presentIn: List.from(presentCourses),
          ));
        }
      }
    });

    // --- 3. Process Tracking Data ---
    for (final item in trackingRecords) {
      if (selectedSemester != 'all' && item.semester != selectedSemester) {
        continue;
      }
      if (selectedYear != 'all' && item.year != selectedYear) {
        continue;
      }

      final String rawCid = item.course.toString();
      final String cid = resolveSafeId(rawCid);

      final String normalizedDate = utils.normalizeDate(item.date);
      final String normalizedSessionNum = utils.normalizeSession(item.session);

      // Use the course entity to get the standardized code for the key
      // Web Parity: Slot keys use Course ID, not Code
      final String key =
          "${rawCid}_${normalizedDate}_${normalizedSessionNum.toUpperCase()}";

      final int trackerStatus = _parseStatus(item.attendance);
      final int? officialStatus = officialMap[key];
      final String courseCode = standardize(
        attendanceData.courses[rawCid]?.code ?? rawCid,
      );
      final bool courseDisabled = disabledCourseCodes.contains(courseCode);

      // The Web Dashboard's strict "True Extra" rule
      final bool isTrulyExtra =
          item.status == 'extra' && officialStatus == null;
      final bool trackerPositive = _isPositive(
        trackerStatus,
        includeOtherLeave: false,
      );
      final bool trackerDL = trackerStatus == 225;
      final bool officialPositive = officialStatus != null
          ? _isPositive(officialStatus, includeOtherLeave: false)
          : false;
      final bool officialDL = officialStatus == 225;

      final course = courseStats[cid];
      if (course != null) {
        // A. Mathematical Update (matches web's updateCourse in DashboardClient.tsx)
        if (isTrulyExtra) {
          course.finalTotal++;
          if (trackerPositive) course.finalPresent++;
        } else {
          if (!officialPositive && trackerPositive) {
            course.finalPresent++;
          } else if (officialPositive && !trackerPositive) {
            course.finalPresent--;
          }
        }

        // B. Visual Layout Update (matches web's loop in CourseCard.tsx)
        if (item.status == 'extra') {
          if (trackerPositive) {
            course.extraPresent++;
          } else {
            course.extraAbsent++;
          }
        } else {
          if (trackerPositive) {
            course.corrPresent++;
          }
        }
      }

      // C. Dashboard Global Aggregation
      if (catalogCodesSet.contains(courseCode) && !courseDisabled) {
        if (isTrulyExtra) {
          if (trackerPositive) {
            extraPresent++;
          } else {
            extraAbsent++;
          }
          if (trackerDL) extraDL++;
        } else {
          if (!officialPositive && trackerPositive) {
            corrPresent++;
          }
          if (!officialPositive && (trackerPositive || trackerDL)) {
            savedAbsent++;
          }
          if (!officialDL && trackerDL) {
            corrDL++;
          }
        }
      }
    }

    final manualTotalGain = extraPresent + extraAbsent;
    final finalTotal = officialTotal + manualTotalGain;
    final finalPresentCount = officialPresent + corrPresent + extraPresent;
    final finalAbsentCount = officialAbsent - savedAbsent + extraAbsent;

    final double rawPercentage = finalTotal > 0
        ? (finalPresentCount / finalTotal) * 100
        : 0.0;
    final double rawOfficialPercentage = officialTotal > 0
        ? (officialPresent / officialTotal) * 100
        : 0.0;

    final Set<String> activeCodes = {};
    courseStats.forEach((cid, stat) {
      if (stat.finalTotal > 0 && !disabledCourseCodes.contains(stat.code)) {
        activeCodes.add(stat.code);
      }
    });
    final activeCourses = activeCodes.length;

    return DashboardStats(
      percentage: rawPercentage.round(),
      rawPercentage: rawPercentage,
      officialPercentage: rawOfficialPercentage.round(),
      rawOfficialPercentage: rawOfficialPercentage,
      officialPresent: officialPresent,
      corrPresent: corrPresent,
      extraPresent: extraPresent,
      finalPresent: finalPresentCount,
      officialAbsent: officialAbsent,
      savedAbsent: savedAbsent,
      extraAbsent: extraAbsent,
      finalAbsent: finalAbsentCount,
      officialTotal: officialTotal,
      finalTotal: finalTotal,
      manualTotalGain: manualTotalGain,
      officialDL: officialDL,
      corrDL: corrDL,
      extraDL: extraDL,
      dlCount: officialDL + corrDL + extraDL,
      specialLeaveCount: officialOther,
      activeCourses: activeCourses,
      totalCoursesCount: catalogCodesSet.length,
      courseStats: courseStats,
      suspiciousAbsences: suspiciousAbsences,
    );
  }

  static int _parseStatus(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    return int.tryParse(val.toString()) ?? 0;
  }
  static bool _isPositive(int status, {bool includeOtherLeave = false}) {
    if (includeOtherLeave && status == 112) return true;
    return [110, 225].contains(status);
  }

  /// Standardizes ID/Code/Name into a consistent Match Key.
  /// Replicates Web's formatCourseCode: splits at hyphens and removes all spaces.
  static String standardize(String input) {
    return input.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
  }
}

class CourseStat {
  final String id;
  final String code;
  final String name;
  int officialPresent = 0;
  int officialTotal = 0;
  int finalPresent = 0;
  int finalTotal = 0;

  int corrPresent = 0;
  int extraPresent = 0;
  int extraAbsent = 0;

  CourseStat({
    required this.id,
    required this.code,
    String? name,
  }) : name = name ?? '';

  int get officialAbsent => officialTotal - officialPresent;
  int get finalAbsent => finalTotal - finalPresent;
  int get manualTotalGain => extraPresent + extraAbsent;

  double get percentage =>
      finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0.0;
  double get officialPercentage =>
      officialTotal > 0 ? (officialPresent / officialTotal) * 100 : 0.0;
}
