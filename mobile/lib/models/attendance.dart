import 'package:ghostclass/logic/type_utils.dart';

class AttendanceCourse {
  final int id;
  final String name;
  final String? code;

  const AttendanceCourse({required this.id, required this.name, this.code});

  factory AttendanceCourse.fromJson(Map<String, dynamic> json) {
    return AttendanceCourse(
      id: toInt(json['id']) ?? 0,
      name: (json['name'] ?? 'Unknown Course').toString(),
      code: json['code'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'code': code};
}

class AttendanceSession {
  final dynamic course;
  final dynamic attendance;
  final dynamic session;
  final String? classType;

  const AttendanceSession({
    this.course,
    this.attendance,
    this.session,
    this.classType,
  });

  factory AttendanceSession.fromJson(Map<String, dynamic> json) {
    return AttendanceSession(
      course: json['course'],
      attendance: json['attendance'],
      session: json['session'],
      classType: (json['class_type'] ?? json['classType']) as String?,
    );
  }
}

class AttendanceReportDetailed {
  final Map<String, AttendanceCourse> courses;
  final Map<String, Map<String, AttendanceSession>> studentAttendanceData;
  final Map<String, dynamic> attendanceDates;
  final Map<String, dynamic> sessions;

  const AttendanceReportDetailed({
    required this.courses,
    required this.studentAttendanceData,
    required this.attendanceDates,
    this.sessions = const {},
  });

  factory AttendanceReportDetailed.fromJson(Map<String, dynamic> json) {
    final rawCourses = (json['courses'] is Map)
        ? Map<String, dynamic>.from(json['courses'] as Map)
        : const <String, dynamic>{};
    final rawAttendance = (json['studentAttendanceData'] is Map)
        ? Map<String, dynamic>.from(json['studentAttendanceData'] as Map)
        : (json['student_attendance_data'] is Map)
            ? Map<String, dynamic>.from(
                json['student_attendance_data'] as Map,
              )
            : const <String, dynamic>{};
    final rawDates = (json['attendanceDates'] is Map)
        ? Map<String, dynamic>.from(json['attendanceDates'] as Map)
        : (json['attendance_dates'] is Map)
            ? Map<String, dynamic>.from(json['attendance_dates'] as Map)
            : const <String, dynamic>{};
    final rawSessions = (json['sessions'] is Map)
        ? Map<String, dynamic>.from(json['sessions'] as Map)
        : const <String, dynamic>{};

    return AttendanceReportDetailed(
      courses: rawCourses.map(
        (key, value) => MapEntry(
          key,
          AttendanceCourse.fromJson(
            (value is Map)
                ? Map<String, dynamic>.from(value)
                : const <String, dynamic>{},
          ),
        ),
      ),
      studentAttendanceData: rawAttendance.map(
        (date, sessions) {
          if (sessions is! Map) {
            return MapEntry(date, <String, AttendanceSession>{});
          }
          return MapEntry(
            date,
            (sessions).map(
              (sessionKey, sessionValue) {
                if (sessionValue is! Map) {
                  return MapEntry(
                    sessionKey,
                    const AttendanceSession(course: 0, attendance: 0),
                  );
                }
                return MapEntry(
                  sessionKey,
                  AttendanceSession.fromJson(
                    Map<String, dynamic>.from(sessionValue),
                  ),
                );
              },
            ),
          );
        },
      ),
      attendanceDates: rawDates,
      sessions: rawSessions,
    );
  }

  Map<String, dynamic> toJson() => {
    'courses': courses.map((key, value) => MapEntry(key, value.toJson())),
    'studentAttendanceData': studentAttendanceData.map(
      (date, sessions) => MapEntry(
        date,
        sessions.map(
          (key, value) => MapEntry(key, {
            'course': value.course,
            'attendance': value.attendance,
            'session': value.session,
            'class_type': value.classType,
          }),
        ),
      ),
    ),
    'attendanceDates': attendanceDates,
    'sessions': sessions,
  };
}

class TrackingRecord {
  final int id;
  final String course;
  final String date;
  final String session;
  final String status;
  final dynamic attendance;
  final String? semester;
  final String? year;
  final String? remarks;

  const TrackingRecord({
    this.id = 0,
    required this.course,
    required this.date,
    required this.session,
    required this.status,
    required this.attendance,
    this.semester,
    this.year,
    this.remarks,
  });

  factory TrackingRecord.fromJson(Map<String, dynamic> json) {
    return TrackingRecord(
      id: toInt(json['id']) ?? 0,
      course: (json['course'] ?? '').toString(),
      date: (json['date'] ?? '').toString(),
      session: (json['session'] ?? '').toString(),
      status: (json['status'] ?? 'correction').toString(),
      attendance: json['attendance'],
      semester: json['semester'] as String?,
      year: json['year'] as String?,
      remarks: json['remarks'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'course': course,
    'date': date,
    'session': session,
    'status': status,
    'attendance': attendance,
    'semester': semester,
    'year': year,
    'remarks': remarks,
  };
}

enum AttendanceStatus {
  present(110),
  absent(111),
  otherLeave(112),
  dutyLeave(225);

  final int code;
  const AttendanceStatus(this.code);

  static AttendanceStatus fromCode(dynamic code) {
    final intCode = toInt(code) ?? 110;
    return AttendanceStatus.values.firstWhere(
      (e) => e.code == intCode,
      orElse: () => AttendanceStatus.present,
    );
  }

  bool get isPositive =>
      this == AttendanceStatus.present ||
      this == AttendanceStatus.dutyLeave ||
      this == AttendanceStatus.otherLeave;
  bool get isNegative => this == AttendanceStatus.absent;
}


