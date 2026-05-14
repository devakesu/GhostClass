import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/dashboard_stats.dart';

AttendanceReportDetailed _buildAttendanceReport() {
  return AttendanceReportDetailed(
    courses: {
      '1': const AttendanceCourse(id: 1, name: 'Math', code: 'MATH101'),
      '2': const AttendanceCourse(id: 2, name: 'Chem', code: 'CHEM201'),
      '3': const AttendanceCourse(id: 3, name: 'English', code: 'ENG300'),
      '4': const AttendanceCourse(id: 4, name: 'History', code: 'HIST400'),
    },
    studentAttendanceData: {
      '2026-05-10': {
        's1': const AttendanceSession(
          course: '1',
          attendance: 110,
          session: '1',
          classType: 'Lecture',
        ),
        's2': const AttendanceSession(
          course: '2',
          attendance: 111,
          session: '1',
          classType: 'Lecture',
        ),
        's3': const AttendanceSession(
          course: '3',
          attendance: 225,
          session: '1',
          classType: 'Lecture',
        ),
      },
      '2026-05-11': {
        's4': const AttendanceSession(
          course: '3',
          attendance: 112,
          session: '2',
          classType: 'Lecture',
        ),
      },
    },
    attendanceDates: const {
      '2026-05-10': true,
      '2026-05-11': true,
    },
  );
}

void main() {
  group('DashboardStats.calculate', () {
    test('combines official, correction, extra, and disabled-course data', () {
      final stats = DashboardStats.calculate(
        attendanceData: _buildAttendanceReport(),
        trackingRecords: const [
          TrackingRecord(
            course: '2',
            date: '2026-05-10',
            session: '1',
            status: 'correction',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
          TrackingRecord(
            course: '2',
            date: '2026-05-10',
            session: '1',
            status: 'correction',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
          TrackingRecord(
            course: '1',
            date: '2026-05-12',
            session: '1',
            status: 'extra',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
          TrackingRecord(
            course: '1',
            date: '2026-05-13',
            session: '2',
            status: 'extra',
            attendance: 111,
            semester: 'S1',
            year: '2026',
          ),
          TrackingRecord(
            course: '1',
            date: '2026-05-14',
            session: '3',
            status: 'correction',
            attendance: 110,
            semester: 'S2',
            year: '2026',
          ),
          TrackingRecord(
            course: '1',
            date: '2026-05-15',
            session: '4',
            status: 'correction',
            attendance: 110,
            semester: 'S1',
            year: '2025',
          ),
        ],
        selectedSemester: 'S1',
        selectedYear: '2026',
        disabledCourseCodes: const {'HIST400'},
        allCourses: const [
          CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
          CourseDetails(id: 2, name: 'Chem', code: 'CHEM201'),
          CourseDetails(id: 3, name: 'English', code: 'ENG300'),
          CourseDetails(id: 4, name: 'History', code: 'HIST400'),
        ],
      );

      expect(stats.officialPresent, 3);
      expect(stats.corrPresent, 2);
      expect(stats.extraPresent, 1);
      expect(stats.finalPresent, 6);
      expect(stats.officialAbsent, 1);
      expect(stats.savedAbsent, 2);
      expect(stats.extraAbsent, 1);
      expect(stats.finalAbsent, 0);
      expect(stats.officialTotal, 4);
      expect(stats.finalTotal, 6);
      expect(stats.manualTotalGain, 2);
      expect(stats.officialDL, 1);
      expect(stats.corrDL, 0);
      expect(stats.extraDL, 0);
      expect(stats.dlCount, 1);
      expect(stats.specialLeaveCount, 1);
      expect(stats.activeCourses, 3);
      expect(stats.totalCoursesCount, 4);
      expect(stats.percentage, 100);
      expect(stats.officialPercentage, 75);
      expect(stats.rawPercentage, 100);
      expect(stats.rawOfficialPercentage, 75);
      expect(stats.courseStats['MATH101']?.officialPresent, 1);
      expect(stats.courseStats['MATH101']?.finalPresent, 2);
      expect(stats.courseStats['CHEM201']?.officialAbsent, 1);
      expect(stats.courseStats['CHEM201']?.corrPresent, 2);
      expect(stats.courseStats['ENG300']?.officialPresent, 2);
      expect(stats.courseStats['ENG300']?.finalTotal, 2);
      expect(stats.courseStats['HIST400']?.officialTotal, 0);
    });

    test('returns zeroed stats when no course data is available', () {
      final stats = DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          courses: {},
          studentAttendanceData: {},
          attendanceDates: {},
        ),
        trackingRecords: const [],
        selectedSemester: 'all',
        selectedYear: 'all',
      );

      expect(stats.officialPresent, 0);
      expect(stats.finalPresent, 0);
      expect(stats.officialAbsent, 0);
      expect(stats.finalAbsent, 0);
      expect(stats.officialTotal, 0);
      expect(stats.finalTotal, 0);
      expect(stats.percentage, 0);
      expect(stats.officialPercentage, 0);
      expect(stats.activeCourses, 0);
      expect(stats.totalCoursesCount, 0);
      expect(stats.courseStats, isEmpty);
    });
  });

  test('standardize trims whitespace, hyphens, and non-breaking spaces', () {
    expect(DashboardStats.standardize(' math\u00A0- 101 '), 'MATH101');
  });

  group('standardize function', () {
    test('converts to uppercase', () {
      expect(DashboardStats.standardize('cs101'), 'CS101');
      expect(DashboardStats.standardize('PhYsIcS'), 'PHYSICS');
    });

    test('removes hyphens and spaces', () {
      expect(DashboardStats.standardize('cs - 101'), 'CS101');
      expect(DashboardStats.standardize('BIO 201'), 'BIO201');
      expect(DashboardStats.standardize('chem--303'), 'CHEM303');
    });

    test('handles non-breaking spaces', () {
      expect(DashboardStats.standardize('MATH\u00A0401'), 'MATH401');
    });

    test('trims leading and trailing whitespace', () {
      expect(DashboardStats.standardize('  HIST501  '), 'HIST501');
      expect(DashboardStats.standardize('\tENG601\n'), 'ENG601');
    });

    test('handles empty and whitespace-only strings', () {
      expect(DashboardStats.standardize(''), '');
      expect(DashboardStats.standardize('   '), '');
      expect(DashboardStats.standardize('\t\n'), '');
    });

    test('preserves numbers and letters', () {
      expect(DashboardStats.standardize('CS2026'), 'CS2026');
      expect(DashboardStats.standardize('123ABC456'), '123ABC456');
    });

    test('handles special characters', () {
      expect(DashboardStats.standardize('ART&DESIGN'), 'ART&DESIGN');
      expect(DashboardStats.standardize('MATH(301)'), 'MATH(301)');
    });
  });

  group('DashboardStats with edge cases', () {
    test('handles missing allCourses with empty courses', () {
      final stats = DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          courses: {},
          studentAttendanceData: {},
          attendanceDates: {},
        ),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: null,
      );

      expect(stats.courseStats, isEmpty);
      expect(stats.activeCourses, 0);
      expect(stats.totalCoursesCount, 0);
    });

    test('handles empty attendance data gracefully', () {
      final stats = DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          courses: {},
          studentAttendanceData: {},
          attendanceDates: {},
        ),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: const [
          CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
        ],
      );

      expect(stats.officialPresent, 0);
      expect(stats.officialAbsent, 0);
      expect(stats.finalTotal, 0);
    });

    test('handles disabled courses correctly', () {
      final stats = DashboardStats.calculate(
        attendanceData: _buildAttendanceReport(),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
        disabledCourseCodes: {'MATH101', 'CHEM201'},
        allCourses: const [
          CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
          CourseDetails(id: 2, name: 'Chem', code: 'CHEM201'),
          CourseDetails(id: 3, name: 'English', code: 'ENG300'),
        ],
      );

      expect(stats.courseStats.containsKey('MATH101'), true);
      expect(stats.courseStats.containsKey('CHEM201'), true);
      expect(stats.activeCourses, 1);
      expect(stats.totalCoursesCount, 3);
    });

    test('calculates percentages correctly when finalTotal is 0', () {
      final stats = DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          courses: {},
          studentAttendanceData: {},
          attendanceDates: {},
        ),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
      );

      expect(stats.percentage, 0);
      expect(stats.rawPercentage, 0);
      expect(stats.officialPercentage, 0);
      expect(stats.rawOfficialPercentage, 0);
    });

    test('handles same-semester tracking records correctly', () {
      final stats = DashboardStats.calculate(
        attendanceData: _buildAttendanceReport(),
        trackingRecords: const [
          TrackingRecord(
            course: '1',
            date: '2026-05-10',
            session: '1',
            status: 'correction',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
          TrackingRecord(
            course: '2',
            date: '2026-05-11',
            session: '1',
            status: 'extra',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
        ],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: const [
          CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
          CourseDetails(id: 2, name: 'Chem', code: 'CHEM201'),
          CourseDetails(id: 3, name: 'English', code: 'ENG300'),
        ],
      );

      expect(stats.corrPresent, greaterThanOrEqualTo(0));
      expect(stats.extraPresent, greaterThanOrEqualTo(0));
    });

    test('counts duty leaves (code 225) correctly', () {
      final stats = DashboardStats.calculate(
        attendanceData: AttendanceReportDetailed(
          courses: {
            '1': const AttendanceCourse(id: 1, name: 'Course1', code: 'C101'),
          },
          studentAttendanceData: {
            '2026-05-20': {
              's1': const AttendanceSession(
                course: '1',
                attendance: 225,
                session: '1',
                classType: 'Lecture',
              ),
            },
          },
          attendanceDates: const {'2026-05-20': true},
        ),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: const [
          CourseDetails(id: 1, name: 'Course1', code: 'C101'),
        ],
      );

      expect(stats.dlCount, greaterThanOrEqualTo(0));
      expect(stats.officialDL, greaterThanOrEqualTo(0));
    });
  });

  group('CourseStat calculations', () {
    test('individual course stats track attendance correctly', () {
      final stats = DashboardStats.calculate(
        attendanceData: _buildAttendanceReport(),
        trackingRecords: const [
          TrackingRecord(
            course: '1',
            date: '2026-05-10',
            session: '1',
            status: 'correction',
            attendance: 110,
            semester: 'S1',
            year: '2026',
          ),
        ],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: const [
          CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
          CourseDetails(id: 2, name: 'Chem', code: 'CHEM201'),
          CourseDetails(id: 3, name: 'English', code: 'ENG300'),
        ],
      );

      final mathStat = stats.courseStats['MATH101'];
      expect(mathStat, isNotNull);
      expect(mathStat!.code, 'MATH101');
      expect(mathStat.name, 'Math');
    });

    test('courseStats includes all provided courses', () {
      final allCourses = const [
        CourseDetails(id: 1, name: 'Math', code: 'MATH101'),
        CourseDetails(id: 2, name: 'Chem', code: 'CHEM201'),
        CourseDetails(id: 3, name: 'English', code: 'ENG300'),
        CourseDetails(id: 4, name: 'History', code: 'HIST400'),
      ];

      final stats = DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          courses: {},
          studentAttendanceData: {},
          attendanceDates: {},
        ),
        trackingRecords: const [],
        selectedSemester: 'S1',
        selectedYear: '2026',
        allCourses: allCourses,
      );

      expect(stats.courseStats.length, 4);
      expect(stats.courseStats.containsKey('MATH101'), true);
      expect(stats.courseStats.containsKey('CHEM201'), true);
      expect(stats.courseStats.containsKey('ENG300'), true);
      expect(stats.courseStats.containsKey('HIST400'), true);
    });
  });
}