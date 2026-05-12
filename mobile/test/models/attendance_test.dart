import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/attendance.dart';

void main() {
  group('AttendanceCourse', () {
    test('fromJson and toJson map correctly', () {
      final json = {'id': 10, 'name': 'Physics', 'code': 'PHY'};
      final c = AttendanceCourse.fromJson(json);
      expect(c.id, 10);
      expect(c.name, 'Physics');
      expect(c.code, 'PHY');
      expect(c.toJson(), json);
    });

    test('fromJson defaults when properties are missing', () {
      final c = AttendanceCourse.fromJson({});
      expect(c.id, 0);
      expect(c.name, 'Unknown Course');
      expect(c.code, isNull);
    });
  });

  group('AttendanceSession', () {
    test('fromJson handles standard and aliased keys', () {
      final s1 = AttendanceSession.fromJson({
        'course': 1,
        'attendance': 110,
        'session': '1st',
        'class_type': 'Lecture',
      });
      expect(s1.classType, 'Lecture');

      final s2 = AttendanceSession.fromJson({
        'course': 1,
        'attendance': 110,
        'session': '1st',
        'classType': 'Lab',
      });
      expect(s2.classType, 'Lab');
    });
  });

  group('AttendanceReportDetailed', () {
    test('fromJson and toJson map full structure with nested defaults', () {
      final json = {
        'courses': {
          'C1': {'id': 1, 'name': 'Math', 'code': null},
        },
        'studentAttendanceData': {
          '2026-05-10': {
            'S1': {
              'course': 1,
              'attendance': 110,
              'session': '1',
              'class_type': 'Theory',
            },
          },
        },
        'attendanceDates': {'2026-05-10': true},
        'sessions': {'S1': '1st Hour'},
      };

      final report = AttendanceReportDetailed.fromJson(json);
      expect(report.courses.length, 1);
      expect(report.studentAttendanceData['2026-05-10']?['S1']?.classType, 'Theory');
      expect(report.toJson(), json);
    });

    test('fromJson handles fallback snake_case keys and empty/malformed structures', () {
      final json = {
        'courses': 'invalid',
        'student_attendance_data': {
          '2026-05-11': 'malformed_session_list',
        },
        'attendance_dates': {'2026-05-11': true},
      };

      final report = AttendanceReportDetailed.fromJson(json);
      expect(report.courses, isEmpty);
      expect(report.studentAttendanceData['2026-05-11'], isEmpty);
      expect(report.attendanceDates.isNotEmpty, true);
    });

    test('fromJson handles nested sessions map structures safely', () {
      final json = {
        'studentAttendanceData': {
          'date1': {
            's1': 'not_a_map', // should map to fallback session
          },
        },
      };

      final report = AttendanceReportDetailed.fromJson(json);
      expect(report.studentAttendanceData['date1']?['s1']?.course, 0);
    });
  });

  group('TrackingRecord', () {
    test('fromJson and toJson work', () {
      final json = {
        'id': 5,
        'course': 'C1',
        'date': '2026-05-12',
        'session': '1',
        'status': 'verified',
        'attendance': 110,
        'semester': 'S1',
        'year': '2026',
        'remarks': 'Good',
      };
      final t = TrackingRecord.fromJson(json);
      expect(t.id, 5);
      expect(t.toJson(), json);
    });
  });

  group('AttendanceStatus', () {
    test('fromCode maps codes correctly', () {
      expect(AttendanceStatus.fromCode(110), AttendanceStatus.present);
      expect(AttendanceStatus.fromCode(111), AttendanceStatus.absent);
      expect(AttendanceStatus.fromCode(112), AttendanceStatus.otherLeave);
      expect(AttendanceStatus.fromCode(225), AttendanceStatus.dutyLeave);
      expect(AttendanceStatus.fromCode(999), AttendanceStatus.present); // default
    });

    test('positive and negative getters work', () {
      expect(AttendanceStatus.present.isPositive, true);
      expect(AttendanceStatus.present.isNegative, false);
      expect(AttendanceStatus.absent.isPositive, false);
      expect(AttendanceStatus.absent.isNegative, true);
    });
  });
}
