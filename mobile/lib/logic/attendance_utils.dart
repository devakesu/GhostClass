import 'package:ghostclass/logic/bunk.dart' as bunk;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/services/logger.dart';

/// Converts a numeric value (1, 2, 3...) to Roman numerals (I, II, III...).
String toRoman(dynamic value) {
  final n = (value is String)
      ? int.tryParse(value) ?? 0
      : (value is num ? value.toInt() : 0);
  if (n < 1) return n.toString();
  const romans = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
    'XI',
    'XII',
  ];
  if (n > 0 && n <= romans.length) {
    return romans[n - 1];
  }
  return n.toString();
}

/// Calculates the current academic semester and year based on the current date
/// or provided overrides. Used as a fallback when server data is unavailable.
Map<String, String> calculateCurrentAcademicInfo({
  String? semester,
  String? year,
}) {
  if (year != null &&
      semester != null &&
      year.isNotEmpty &&
      semester.isNotEmpty) {
    final sem = semester.toLowerCase();
    String? normalizedSem;
    if (sem.contains('odd') || sem == '1') {
      normalizedSem = 'odd';
    } else if (sem.contains('even') || sem == '2') {
      normalizedSem = 'even';
    }

    if (normalizedSem != null) {
      return {'current_semester': normalizedSem, 'current_year': year};
    }
  }

  // Clock-based fallback derivation
  final now = DateTime.now();
  final month = now.month; // 1-indexed: 1 = Jan, 6 = June
  final fullYear = now.year;

  // In most systems, Jan-June (months 1-6) is the second half ("Even") semester
  // July-Dec (months 7-12) is the first half ("Odd") semester.
  final isFirstHalf = month <= 6;
  final currentSemester = isFirstHalf ? 'even' : 'odd';

  // An academic year spanning two calendar years (e.g., 2024-25).
  // Even semesters usually belong to the year that started last summer.
  final startYearNum = isFirstHalf ? fullYear - 1 : fullYear;
  final endYearShort = (startYearNum + 1).toString().substring(2);
  final currentYearStr = '$startYearNum-$endYearShort';

  return {'current_semester': currentSemester, 'current_year': currentYearStr};
}

/// Normalizes various date formats into a standard YYYYMMDD string.
String normalizeDate(dynamic date) {
  if (date == null) return '';

  if (date is DateTime) {
    final y = date.year.toString();
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y$m$d';
  }

  final s = date.toString().trim();
  if (s.isEmpty) return '';

  // Handle ISO datetime strings (2024-01-15T10:30:00Z)
  final base = s.contains('T') ? s.split('T')[0] : s;

  // 1. YYYYMMDD (no separator)
  if (RegExp(r'^\d{8}$').hasMatch(base)) return base;

  // 2. Dash-separated (YYYY-MM-DD or DD-MM-YYYY)
  if (base.contains('-')) {
    final parts = base.split('-');
    if (parts.length == 3) {
      final a = parts[0].trim();
      final b = parts[1].trim();
      final c = parts[2].trim();

      if (RegExp(r'^\d+$').hasMatch(a) &&
          RegExp(r'^\d+$').hasMatch(b) &&
          RegExp(r'^\d+$').hasMatch(c)) {
        final year = (a.length == 4) ? int.parse(a) : int.parse(c);
        final month = int.parse(b);
        final day = (a.length == 4) ? int.parse(c) : int.parse(a);

        if (month < 1 || month > 12 || day < 1 || day > 31) return '';

        final parsed = DateTime.tryParse(
          "${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}",
        );
        if (parsed == null ||
            parsed.year != year ||
            parsed.month != month ||
            parsed.day != day)
          return '';

        if (a.length == 4) {
          // YYYY-MM-DD
          return "$a${b.padLeft(2, '0')}${c.padLeft(2, '0')}";
        } else if (c.length == 4) {
          // DD-MM-YYYY
          return "$c${b.padLeft(2, '0')}${a.padLeft(2, '0')}";
        }
      }
    }
  }

  // 3. Slash-separated (DD/MM/YYYY or YYYY/MM/DD)
  if (base.contains('/')) {
    final parts = base.split('/');
    if (parts.length == 3) {
      final a = parts[0].trim();
      final b = parts[1].trim();
      final c = parts[2].trim();

      if (RegExp(r'^\d+$').hasMatch(a) &&
          RegExp(r'^\d+$').hasMatch(b) &&
          RegExp(r'^\d+$').hasMatch(c)) {
        final year = (a.length == 4) ? int.parse(a) : int.parse(c);
        final month = int.parse(b);
        final day = (a.length == 4) ? int.parse(c) : int.parse(a);

        if (month < 1 || month > 12 || day < 1 || day > 31) return '';

        final parsed = DateTime.tryParse(
          "${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}",
        );
        if (parsed == null ||
            parsed.year != year ||
            parsed.month != month ||
            parsed.day != day)
          return '';

        if (a.length == 4) {
          // YYYY/MM/DD
          return "$a${b.padLeft(2, '0')}${c.padLeft(2, '0')}";
        } else {
          // DD/MM/YYYY
          return "$c${b.padLeft(2, '0')}${a.padLeft(2, '0')}";
        }
      }
    }
  }

  AppLogger.w(
    'attendance_utils.normalizeDate: Unrecognized date format. Returning empty string to avoid invalid slot keys.',
    {'raw': s},
  );
  return '';
}

/// Normalizes session identifiers (e.g., "1st Hour", "Session I") to a numeric string.
String normalizeSession(dynamic session) {
  if (session == null) return '';
  var s = session.toString().toLowerCase().trim();

  // 1. Remove common noise
  s = s.replaceAll(RegExp('session|lecture|lec|lab|hour|hr|period'), '').trim();
  s = s.replaceAll(RegExp(r'(st|nd|rd|th)$'), '').trim(); // Remove ordinals

  // Collapse internal multi-spaces and take only the first word
  s = s.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (s.contains(' ')) s = s.split(' ')[0];

  // 2. Roman to Number Map
  const romans = {
    'viii': '8',
    'vii': '7',
    'vi': '6',
    'v': '5',
    'iv': '4',
    'iii': '3',
    'ii': '2',
    'i': '1',
    'ix': '9',
    'x': '10',
    'xi': '11',
    'xii': '12',
  };

  if (romans.containsKey(s)) return romans[s]!;

  // 3. Parse Integer
  final num = int.tryParse(s);
  if (num != null) {
    return num.toString();
  }

  // 4. Fallback
  return s.toUpperCase();
}

/// Formats a session identifier for display (e.g., "1" -> "1st Hour").
String formatSessionName(String sessionName) {
  if (sessionName.isEmpty) return '';
  final clean = sessionName
      .replaceAll(RegExp('Session|Hour', caseSensitive: false), '')
      .trim();

  final lower = clean.toLowerCase();
  const romanMap = {
    'i': '1st Hour',
    'ii': '2nd Hour',
    'iii': '3rd Hour',
    'iv': '4th Hour',
    'v': '5th Hour',
    'vi': '6th Hour',
    'vii': '7th Hour',
    'viii': '8th Hour',
    'ix': '9th Hour',
    'x': '10th Hour',
    'xi': '11th Hour',
    'xii': '12th Hour',
  };

  if (romanMap.containsKey(lower)) return romanMap[lower]!;

  final num = int.tryParse(clean);
  if (num != null && num > 0) {
    final j = num % 10;
    final k = num % 100;
    if (j == 1 && k != 11) return '${num}st Hour';
    if (j == 2 && k != 12) return '${num}nd Hour';
    if (j == 3 && k != 13) return '${num}rd Hour';
    return '${num}th Hour';
  }

  return sessionName.toLowerCase().contains('session')
      ? sessionName
      : 'Session $sessionName';
}

/// Extracts the numeric value from a session name for sorting.
int getSessionNumber(String name) {
  if (name.isEmpty) return 999;
  final clean = name
      .toLowerCase()
      .replaceAll(RegExp('session|hour'), '')
      .trim();

  const romanMap = {
    'i': 1,
    'ii': 2,
    'iii': 3,
    'iv': 4,
    'v': 5,
    'vi': 6,
    'vii': 7,
    'viii': 8,
    'ix': 9,
    'x': 10,
    'xi': 11,
    'xii': 12,
  };

  if (romanMap.containsKey(clean)) return romanMap[clean]!;

  final match = RegExp(r'\d+').firstMatch(clean);
  if (match != null) {
    return int.tryParse(match.group(0)!) ?? 999;
  }
  return 999;
}

/// Resolves the human-readable display name for a course.
/// Handles the priority: High-fidelity merged name -> Official Report name -> Fallback ID.
String resolveCourseDisplayName({
  required String courseKey,
  CourseDetails? mergedCourse,
  AttendanceReportDetailed? officialReport,
}) {
  // 1. If we have a high-fidelity merged course (standard ID and has a name/code), use it.
  if (mergedCourse != null && mergedCourse.id != 0) {
    return mergedCourse.name;
  }

  // 2. Fallback to Official Report (Case Insensitive)
  final normalizedKey = courseKey.trim().toUpperCase();

  // Try direct lookup
  var official = officialReport?.courses[courseKey];

  // Try case-insensitive lookup if direct fails
  if (official == null && officialReport != null) {
    for (final entry in officialReport.courses.entries) {
      if (entry.key.trim().toUpperCase() == normalizedKey) {
        official = entry.value;
        break;
      }
    }
  }

  if (official != null) return official.name;

  // 3. Absolute Fallback
  return mergedCourse?.name ?? courseKey;
}

String? resolveCourseDisplayCode({
  required String courseKey,
  CourseDetails? mergedCourse,
  AttendanceReportDetailed? officialReport,
}) {
  if (mergedCourse?.code != null) return mergedCourse!.code;

  // Fallback to Official Report (Case Insensitive)
  final normalizedKey = courseKey.trim().toUpperCase();
  var official = officialReport?.courses[courseKey];

  if (official == null && officialReport != null) {
    for (final entry in officialReport.courses.entries) {
      if (entry.key.trim().toUpperCase() == normalizedKey) {
        official = entry.value;
        break;
      }
    }
  }

  return official?.code;
}

typedef AttendanceResult = bunk.AttendanceResult;

AttendanceResult calculateAttendance(
  int present,
  int total, {
  double targetPercentage = 75.0,
}) {
  return bunk.calculateAttendance(
    present,
    total,
    targetPercentage: targetPercentage,
  );
}

String toTitleCase(String text) {
  if (text.isEmpty) return text;
  return text
      .toLowerCase()
      .split(' ')
      .where((word) => word.isNotEmpty)
      .map((word) {
        return word[0].toUpperCase() + word.substring(1);
      })
      .join(' ');
}

String standardizeCourseCode(String input) {
  return input.trim().toUpperCase().replaceAll(RegExp(r'[\s\u00A0-]'), '');
}

const Set<String> remarkPlaceholders = {
  'Duty Leave',
  'Self-Marked: Duty Leave',
  'Self-Marked: Present',
  'Self-Marked: Absent',
};
