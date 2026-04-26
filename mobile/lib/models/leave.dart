class Leave {
  final int id;
  final String? leaveReason;
  final String createdAt;
  final AttendanceType? attendanceType;
  final Event? event;
  final List<LeaveApprover> approvers;
  final UserSubgroup? userSubgroup;
  final List<dynamic>? files;

  Leave({
    required this.id,
    this.leaveReason,
    required this.createdAt,
    this.attendanceType,
    this.event,
    required this.approvers,
    this.userSubgroup,
    this.files,
  });

  factory Leave.fromJson(Map<String, dynamic> json) {
    return Leave(
      id: json['id'] as int,
      leaveReason: json['leave_reason'] as String?,
      createdAt: json['created_at'] as String,
      attendanceType: json['attendancetype'] != null
          ? AttendanceType.fromJson(json['attendancetype'])
          : null,
      event: json['event'] != null ? Event.fromJson(json['event']) : null,
      approvers: (json['approvers'] as List? ?? [])
          .map((a) => LeaveApprover.fromJson(a))
          .toList(),
      userSubgroup: json['usersubgroup'] != null
          ? UserSubgroup.fromJson(json['usersubgroup'])
          : null,
      files: json['files'] as List?,
    );
  }
}

class AttendanceType {
  final int id;
  final String name;

  AttendanceType({required this.id, required this.name});

  factory AttendanceType.fromJson(Map<String, dynamic> json) {
    return AttendanceType(
      id: json['id'] as int,
      name: json['name'] as String? ?? 'Leave',
    );
  }
}

class Event {
  final int id;
  final String name;

  Event({required this.id, required this.name});

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'] as int,
      name: json['name'] as String? ?? 'Event',
    );
  }
}

class LeaveApprover {
  final int id;
  final String? actionType;
  final String? actionAt;
  final String updatedAt;
  final ApproverUser? actionByUser;

  LeaveApprover({
    required this.id,
    this.actionType,
    this.actionAt,
    required this.updatedAt,
    this.actionByUser,
  });

  factory LeaveApprover.fromJson(Map<String, dynamic> json) {
    return LeaveApprover(
      id: json['id'] as int,
      actionType: json['action_type'] as String?,
      actionAt: json['action_at'] as String?,
      updatedAt: json['updated_at'] as String? ?? '',
      actionByUser: json['action_by_user'] != null
          ? ApproverUser.fromJson(json['action_by_user'])
          : null,
    );
  }
}

class ApproverUser {
  final String firstName;
  final String lastName;

  ApproverUser({required this.firstName, required this.lastName});

  factory ApproverUser.fromJson(Map<String, dynamic> json) {
    return ApproverUser(
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
    );
  }
}

class UserSubgroup {
  final String academicSemester;
  final String academicYear;

  UserSubgroup({required this.academicSemester, required this.academicYear});

  factory UserSubgroup.fromJson(Map<String, dynamic> json) {
    return UserSubgroup(
      academicSemester: json['academic_semester'] as String? ?? '',
      academicYear: json['academic_year'] as String? ?? '',
    );
  }
}

class LeaveSession {
  final int id;
  final String date;
  final Session? session;
  final Course? course;

  LeaveSession({required this.id, required this.date, this.session, this.course});

  factory LeaveSession.fromJson(Map<String, dynamic> json) {
    return LeaveSession(
      id: json['id'] as int,
      date: json['date'] as String,
      session: json['session'] != null ? Session.fromJson(json['session']) : null,
      course: json['course'] != null ? Course.fromJson(json['course']) : null,
    );
  }
}

class Session {
  final String name;
  Session({required this.name});
  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(name: json['name'] as String? ?? '');
  }
}

class Course {
  final String? name;
  final String? code;
  Course({this.name, this.code});
  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      name: json['name'] as String?,
      code: json['code'] as String?,
    );
  }
}
