class Leave {
  Leave({
    required this.id,
    required this.createdAt,
    required this.approvers,
    this.leaveReason,
    this.attendanceType,
    this.event,
    this.userSubgroup,
    this.files,
  });

  factory Leave.fromJson(Map<String, dynamic> json) {
    return Leave(
      id: int.parse(json['id'].toString()),
      leaveReason: json['leave_reason'] as String?,
      createdAt: json['created_at'] as String,
      attendanceType: json['attendancetype'] != null
          ? AttendanceType.fromJson(
              json['attendancetype'] as Map<String, dynamic>,
            )
          : null,
      event: json['event'] != null
          ? Event.fromJson(json['event'] as Map<String, dynamic>)
          : null,
      approvers: List<LeaveApprover>.from(
        (json['approvers'] as List? ?? []).map(
          (a) => LeaveApprover.fromJson(a as Map<String, dynamic>),
        ),
      ),
      userSubgroup: json['usersubgroup'] != null
          ? UserSubgroup.fromJson(json['usersubgroup'] as Map<String, dynamic>)
          : null,
      files: json['files'] != null
          ? List<LeaveFile>.from(
              (json['files'] as List).map(
                (f) => LeaveFile.fromJson(f as Map<String, dynamic>),
              ),
            )
          : null,
    );
  }
  final int id;
  final String? leaveReason;
  final String createdAt;
  final AttendanceType? attendanceType;
  final Event? event;
  final List<LeaveApprover> approvers;
  final UserSubgroup? userSubgroup;
  final List<LeaveFile>? files;
}

class LeaveFile {
  LeaveFile({required this.id, required this.fileName, required this.sizeByte});

  factory LeaveFile.fromJson(Map<String, dynamic> json) {
    return LeaveFile(
      id: int.parse(json['id'].toString()),
      fileName: json['file_name'] as String? ?? 'file',
      sizeByte: int.parse((json['size_byte'] ?? 0).toString()),
    );
  }
  final int id;
  final String fileName;
  final int sizeByte;
}

class AttendanceType {
  AttendanceType({required this.id, required this.name});

  factory AttendanceType.fromJson(Map<String, dynamic> json) {
    return AttendanceType(
      id: int.parse(json['id'].toString()),
      name: json['name'] as String? ?? 'Leave',
    );
  }
  final int id;
  final String name;
}

class Event {
  Event({required this.id, required this.name});

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: int.parse(json['id'].toString()),
      name: json['name'] as String? ?? 'Event',
    );
  }
  final int id;
  final String name;
}

class LeaveApprover {
  LeaveApprover({
    required this.id,
    required this.updatedAt,
    this.actionType,
    this.actionAt,
    this.actionByUser,
  });

  factory LeaveApprover.fromJson(Map<String, dynamic> json) {
    return LeaveApprover(
      id: int.parse(json['id'].toString()),
      actionType: json['action_type'] as String?,
      actionAt: json['action_at'] as String?,
      updatedAt: json['updated_at'] as String? ?? '',
      actionByUser: json['action_by_user'] != null
          ? ApproverUser.fromJson(
              json['action_by_user'] as Map<String, dynamic>,
            )
          : null,
    );
  }
  final int id;
  final String? actionType;
  final String? actionAt;
  final String updatedAt;
  final ApproverUser? actionByUser;
}

class ApproverUser {
  ApproverUser({required this.firstName, required this.lastName});

  factory ApproverUser.fromJson(Map<String, dynamic> json) {
    return ApproverUser(
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
    );
  }
  final String firstName;
  final String lastName;
}

class UserSubgroup {
  UserSubgroup({required this.academicSemester, required this.academicYear});

  factory UserSubgroup.fromJson(Map<String, dynamic> json) {
    return UserSubgroup(
      academicSemester: json['academic_semester'] as String? ?? '',
      academicYear: json['academic_year'] as String? ?? '',
    );
  }
  final String academicSemester;
  final String academicYear;
}

class LeaveSession {
  LeaveSession({
    required this.id,
    required this.date,
    this.session,
    this.course,
  });

  factory LeaveSession.fromJson(Map<String, dynamic> json) {
    return LeaveSession(
      id: int.parse(json['id'].toString()),
      date: json['date'] as String,
      session: json['session'] != null
          ? Session.fromJson(json['session'] as Map<String, dynamic>)
          : null,
      course: json['course'] != null
          ? Course.fromJson(json['course'] as Map<String, dynamic>)
          : null,
    );
  }
  final int id;
  final String date;
  final Session? session;
  final Course? course;
}

class Session {
  Session({required this.name});
  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(name: json['name'] as String? ?? '');
  }
  final String name;
}

class Course {
  Course({this.name, this.code});
  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      name: json['name'] as String?,
      code: json['code'] as String?,
    );
  }
  final String? name;
  final String? code;
}
