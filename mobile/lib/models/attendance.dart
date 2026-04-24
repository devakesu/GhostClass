class AttendanceCourse {
  final int id;
  final String name;
  final String? code;

  const AttendanceCourse({required this.id, required this.name, this.code});

  factory AttendanceCourse.fromJson(Map<String, dynamic> json) {
    return AttendanceCourse(
      id: _toInt(json['id']) ?? 0,
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

  const AttendanceReportDetailed({
    required this.courses,
    required this.studentAttendanceData,
    required this.attendanceDates,
  });

  factory AttendanceReportDetailed.fromJson(Map<String, dynamic> json) {
    final rawCourses = json['courses'] as Map<String, dynamic>? ?? const {};
    final rawAttendance =
        json['studentAttendanceData'] as Map<String, dynamic>? ??
        json['student_attendance_data'] as Map<String, dynamic>? ??
        const {};
    final rawDates =
        json['attendanceDates'] as Map<String, dynamic>? ??
        json['attendance_dates'] as Map<String, dynamic>? ??
        const {};

    return AttendanceReportDetailed(
      courses: rawCourses.map(
        (key, value) => MapEntry(
          key,
          AttendanceCourse.fromJson((value as Map).cast<String, dynamic>()),
        ),
      ),
      studentAttendanceData: rawAttendance.map(
        (date, sessions) => MapEntry(
          date,
          (sessions as Map).map(
            (sessionKey, sessionValue) => MapEntry(
              sessionKey,
              AttendanceSession.fromJson(
                (sessionValue as Map).cast<String, dynamic>(),
              ),
            ),
          ),
        ),
      ),
      attendanceDates: rawDates,
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
      id: _toInt(json['id']) ?? 0,
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

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
