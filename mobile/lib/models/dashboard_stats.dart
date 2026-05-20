import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/services/logger.dart';

class DashboardStats {
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
  });

  factory DashboardStats.calculate({
    required AttendanceReportDetailed attendanceData,
    required List<TrackingRecord> trackingRecords,
    required String selectedSemester,
    required String selectedYear,
    Set<String> disabledCourseCodes = const <String>{},
    List<CourseDetails>? allCourses,
  }) {
    var officialPresent = 0;
    var officialAbsent = 0;
    var officialDL = 0;
    var officialOther = 0;
    var officialTotal = 0;

    var corrPresent = 0;
    var savedAbsent = 0;
    var corrDL = 0;
    var extraPresent = 0;
    var extraAbsent = 0;
    var extraDL = 0;

    final courseStats = <String, CourseStat>{};

    // --- 1. Robust Identity Resolution System (Web Parity) ---
    final lookupMap = <String, String>{}; // StandardizedCode -> SafeId
    final idToSafeId = <String, String>{}; // NumericID -> SafeId
    final catalogCodesSet = <String>{}; // For denominator filtering

    if (allCourses != null) {
      for (final course in allCourses) {
        final safeId = course.safeId;
        final stdCode = standardize(course.code ?? course.id.toString());

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
      final raw = input.trim();
      final std = standardize(raw);
      if (lookupMap.containsKey(std)) return lookupMap[std]!;
      if (idToSafeId.containsKey(raw)) return idToSafeId[raw]!;
      return raw;
    }

    // --- 2. Process Official Data ---
    final officialMap = <String, int>{};

    attendanceData.studentAttendanceData.forEach((date, dailySessions) {
      dailySessions.forEach((sessionKey, session) {
        if (session.course != null && session.classType != 'Revision') {
          final rawCid = session.course.toString();
          final cid = resolveSafeId(rawCid);

          final status = _parseStatus(session.attendance);
          final rawCourseCode = attendanceData.courses[rawCid]?.code ?? rawCid;
          final stdCourseCode = standardize(rawCourseCode);
          final courseDisabled = disabledCourseCodes.contains(
            stdCourseCode,
          );

          // Web Parity: Only specific codes count toward official stats
          final attStatus = AttendanceStatus.fromCode(status);
          final isPos = attStatus.isPositive;
          final isNeg = attStatus.isNegative;
          final isValid = isPos || isNeg;

          if (isValid) {
            final normalizedDate = utils.normalizeDate(date);
            final normalizedSessionNum = utils.normalizeSession(
              session.session ?? sessionKey,
            );
            final key =
                '${rawCid}_${normalizedDate}_${normalizedSessionNum.toUpperCase()}';

            officialMap[key] = status;

            var course = courseStats[cid];
            if (course == null) {
              final name = attendanceData.courses[rawCid]?.name ?? rawCid;
              course = CourseStat(id: cid, code: stdCourseCode, name: name);
              courseStats[cid] = course;
            }

            course.officialTotal++;
            course.finalTotal++;
            if (_isPositive(status)) {
              course.officialPresent++;
              course.finalPresent++;
            }

            if (catalogCodesSet.contains(stdCourseCode) && !courseDisabled) {
              officialTotal++;
              final statusObj = AttendanceStatus.fromCode(status);
              if (statusObj.isPositive) {
                officialPresent++;
              } else {
                officialAbsent++;
              }
              if (status == AttendanceStatus.dutyLeave.code) officialDL++;
              if (status == AttendanceStatus.otherLeave.code) officialOther++;
            }
          }
        }
      });
    });

    // --- 3. Process Tracking Data ---
    for (final item in trackingRecords) {
      if (selectedSemester != 'all' && item.semester != selectedSemester) {
        continue;
      }
      if (selectedYear != 'all' && item.year != selectedYear) {
        continue;
      }

      final rawCid = item.course;
      final cid = resolveSafeId(rawCid);

      final normalizedDate = utils.normalizeDate(item.date);
      final normalizedSessionNum = utils.normalizeSession(item.session);
      final key =
          '${rawCid}_${normalizedDate}_${normalizedSessionNum.toUpperCase()}';

      final trackerStatus = _parseStatus(item.attendance);
      final officialStatus = officialMap[key];
      final courseCode = standardize(
        attendanceData.courses[rawCid]?.code ?? rawCid,
      );
      final courseDisabled = disabledCourseCodes.contains(courseCode);

      final isTrulyExtra = item.status == 'extra' && officialStatus == null;
      final trackerPositive = _isPositive(trackerStatus);
      final trackerDL = trackerStatus == AttendanceStatus.dutyLeave.code;
      final officialPositive =
          officialStatus != null && _isPositive(officialStatus);
      final officialDLStatus =
          officialStatus == AttendanceStatus.dutyLeave.code;

      final course = courseStats[cid];
      if (course != null) {
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
          if (!officialDLStatus && trackerDL) {
            corrDL++;
          }
        }
      }
    }

    final manualTotalGain = extraPresent + extraAbsent;
    final finalTotal = officialTotal + manualTotalGain;
    final finalPresentCount = officialPresent + corrPresent + extraPresent;
    // Clamp to 0 to guard against data drift between sync cycles where a
    // tracker correction targets a session already positive in the official
    // report, causing savedAbsent to exceed officialAbsent in production.
    final rawFinalAbsent = officialAbsent - savedAbsent + extraAbsent;
    final finalAbsentCount = rawFinalAbsent.clamp(0, double.maxFinite).toInt();
    if (rawFinalAbsent < 0) {
      AppLogger.e(
        'DashboardStats: Attendance invariant violation – finalAbsent was '
        '$rawFinalAbsent, clamped to 0 '
        '(official: $officialAbsent, saved: $savedAbsent, extra: $extraAbsent)',
      );
    }

    final rawPercentage = finalTotal > 0
        ? (finalPresentCount / finalTotal) * 100
        : 0.0;
    final rawOfficialPercentage = officialTotal > 0
        ? (officialPresent / officialTotal) * 100
        : 0.0;

    final activeCodes = <String>{};
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
    );
  }
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

  static int _parseStatus(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    return int.tryParse(val.toString()) ?? 0;
  }

  static bool _isPositive(int status) {
    return AttendanceStatus.fromCode(status).isPositive;
  }

  static String standardize(String input) {
    // Note: the '-' is placed last in the character class to avoid forming an
    // ambiguous or reversed range (\u00A0 > '-' in code-point order).
    return input.trim().toUpperCase().replaceAll(RegExp(r'[\s\u00A0\-]'), '');
  }
}

class CourseStat {
  CourseStat({
    required this.id,
    required this.code,
    String? name,
  }) : name = name ?? '';
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

  int get officialAbsent => officialTotal - officialPresent;
  int get finalAbsent => finalTotal - finalPresent;
  int get manualTotalGain => extraPresent + extraAbsent;

  double get percentage =>
      finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0.0;
  double get officialPercentage =>
      officialTotal > 0 ? (officialPresent / officialTotal) * 100 : 0.0;
}
