import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';

void main() {
  group('Attendance Utils - toRoman', () {
    test('converts integers correctly', () {
      expect(toRoman(1), 'I');
      expect(toRoman(5), 'V');
      expect(toRoman(12), 'XII');
    });

    test('converts strings correctly', () {
      expect(toRoman('2'), 'II');
      expect(toRoman('invalid'), '0');
    });

    test('handles edge cases', () {
      expect(toRoman(0), '0');
      expect(toRoman(13), '13');
      expect(toRoman(-1), '-1');
      expect(toRoman(null), '0');
    });
  });

  group('Attendance Utils - calculateCurrentAcademicInfo', () {
    test('uses provided semester and year', () {
      final info = calculateCurrentAcademicInfo(semester: '1', year: '2023-24');
      expect(info['current_semester'], 'odd');
      expect(info['current_year'], '2023-24');

      final evenInfo = calculateCurrentAcademicInfo(
        semester: 'Even',
        year: '2024-25',
      );
      expect(evenInfo['current_semester'], 'even');
      expect(evenInfo['current_year'], '2024-25');
    });

    test('handles fallback when no data provided', () {
      final info = calculateCurrentAcademicInfo();
      expect(info.containsKey('current_semester'), true);
      expect(info.containsKey('current_year'), true);
    });
  });

  group('Attendance Utils - normalizeDate', () {
    test('handles DateTime object', () {
      final date = DateTime(2024, 1, 15);
      expect(normalizeDate(date), '20240115');
    });

    test('handles YYYYMMDD string', () {
      expect(normalizeDate('20240115'), '20240115');
    });

    test('handles ISO strings', () {
      expect(normalizeDate('2024-01-15T10:30:00Z'), '20240115');
    });

    test('handles Dash-separated (YYYY-MM-DD)', () {
      expect(normalizeDate('2024-01-15'), '20240115');
    });

    test('handles Dash-separated (DD-MM-YYYY)', () {
      expect(normalizeDate('15-01-2024'), '20240115');
    });

    test('handles Slash-separated (DD/MM/YYYY)', () {
      expect(normalizeDate('15/01/2024'), '20240115');
    });

    test('handles Slash-separated (YYYY/MM/DD)', () {
      expect(normalizeDate('2024/01/15'), '20240115');
    });

    test('returns empty string for invalid dates', () {
      expect(normalizeDate('invalid'), '');
      expect(normalizeDate(null), '');
      expect(normalizeDate('99-99-9999'), '');
      expect(normalizeDate('31-02-2024'), ''); // Invalid day for Feb
    });
  });

  group('Attendance Utils - normalizeSession', () {
    test('removes noise and normalizes ordinals', () {
      expect(normalizeSession('1st Hour'), '1');
      expect(normalizeSession('Session 2'), '2');
      expect(normalizeSession('3rd period'), '3');
      expect(normalizeSession('IV session'), '4');
    });

    test('handles Roman numerals', () {
      expect(normalizeSession('I'), '1');
      expect(normalizeSession('VIII'), '8');
    });

    test('handles case sensitivity and spaces', () {
      expect(normalizeSession('  5th  hour  '), '5');
    });

    test('fallback returns uppercase string', () {
      expect(normalizeSession('Special'), 'SPECIAL');
    });
  });

  group('Attendance Utils - formatSessionName', () {
    test('formats numbers correctly', () {
      expect(formatSessionName('1'), '1st Hour');
      expect(formatSessionName('2'), '2nd Hour');
      expect(formatSessionName('3'), '3rd Hour');
      expect(formatSessionName('4'), '4th Hour');
      expect(formatSessionName('11'), '11th Hour');
      expect(formatSessionName('21'), '21st Hour');
    });

    test('handles Roman numeral input', () {
      expect(formatSessionName('I'), '1st Hour');
      expect(formatSessionName('V'), '5th Hour');
    });

    test('handles non-numeric fallback', () {
      expect(formatSessionName('Laboratory'), 'Session Laboratory');
    });
  });

  group('Attendance Utils - getSessionNumber', () {
    test('extracts numbers correctly', () {
      expect(getSessionNumber('1st Hour'), 1);
      expect(getSessionNumber('Session 10'), 10);
    });

    test('handles Roman numerals', () {
      expect(getSessionNumber('VIII'), 8);
    });

    test('returns 999 for invalid', () {
      expect(getSessionNumber(''), 999);
      expect(getSessionNumber('Unknown'), 999);
    });
  });

  group('Attendance Utils - resolveCourseDisplayName', () {
    const courseDetails = CourseDetails(
      id: 101,
      name: 'Advanced Java',
      code: 'JAVA101',
    );
    const officialReport = AttendanceReportDetailed(
      courses: {
        'C1': AttendanceCourse(id: 1, name: 'Computer Science', code: 'CS01'),
      },
      studentAttendanceData: {},
      attendanceDates: {},
    );

    test('prioritizes mergedCourse', () {
      final name = resolveCourseDisplayName(
        courseKey: 'C1',
        mergedCourse: courseDetails,
      );
      expect(name, 'Advanced Java');
    });

    test('falls back to officialReport', () {
      final name = resolveCourseDisplayName(
        courseKey: 'C1',
        officialReport: officialReport,
      );
      expect(name, 'Computer Science');
    });

    test('handles case-insensitive officialReport lookup', () {
      final name = resolveCourseDisplayName(
        courseKey: 'c1',
        officialReport: officialReport,
      );
      expect(name, 'Computer Science');
    });

    test('absolute fallback to courseKey', () {
      final name = resolveCourseDisplayName(courseKey: 'UNKNOWN');
      expect(name, 'UNKNOWN');

      // Test mergedCourse with id == 0 absolute fallback
      final nameZero = resolveCourseDisplayName(
        courseKey: 'UNKNOWN',
        mergedCourse: const CourseDetails(
          id: 0,
          name: 'FallbackName',
          code: 'FB',
        ),
      );
      expect(nameZero, 'FallbackName');
    });
  });

  group('Attendance Utils - resolveCourseDisplayCode', () {
    const courseDetails = CourseDetails(
      id: 101,
      name: 'Advanced Java',
      code: 'JAVA101',
    );
    const officialReport = AttendanceReportDetailed(
      courses: {
        'C1': AttendanceCourse(id: 1, name: 'Computer Science', code: 'CS01'),
      },
      studentAttendanceData: {},
      attendanceDates: {},
    );

    test('prioritizes mergedCourse code', () {
      final code = resolveCourseDisplayCode(
        courseKey: 'C1',
        mergedCourse: courseDetails,
      );
      expect(code, 'JAVA101');
    });

    test('falls back to officialReport code', () {
      final code = resolveCourseDisplayCode(
        courseKey: 'C1',
        officialReport: officialReport,
      );
      expect(code, 'CS01');
    });

    test('handles case-insensitive officialReport lookup code', () {
      final code = resolveCourseDisplayCode(
        courseKey: 'c1',
        officialReport: officialReport,
      );
      expect(code, 'CS01');
    });

    test('returns null if not found anywhere', () {
      final code = resolveCourseDisplayCode(courseKey: 'UNKNOWN');
      expect(code, isNull);
    });
  });

  group('Attendance Utils - Helper Methods', () {
    test('toTitleCase', () {
      expect(toTitleCase('hello world'), 'Hello World');
      expect(toTitleCase('HELLO WORLD'), 'Hello World');
      expect(toTitleCase(''), '');
    });

    test('standardizeCourseCode', () {
      expect(standardizeCourseCode(' CS-101 '), 'CS101');
      expect(standardizeCourseCode('cs\u00A0101'), 'CS101');
    });

    test('calculateAttendance delegates to bunk', () {
      final result = calculateAttendance(10, 10);
      expect(
        result.canBunk,
        3,
      ); // (10 - 0.75 * 10) / 0.75 = 2.5 / 0.75 = 3.33 -> 3
      expect(result.requiredToAttend, 0);
    });
  });
}
