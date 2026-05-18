import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';

class MockDashboardNotifier extends DashboardNotifier {
  MockDashboardNotifier(this.data);
  final DashboardData data;
  @override
  FutureOr<DashboardData> build() => data;
}

class MockAuthNotifier extends AuthNotifier {
  MockAuthNotifier(this.user);
  final AuthenticatedUser? user;
  @override
  FutureOr<AuthenticatedUser?> build() => user;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {}
}

class MockTrackingNotifier extends TrackingNotifier {
  MockTrackingNotifier(this.data);
  final TrackingState data;
  @override
  FutureOr<TrackingState> build() => data;

  @override
  Future<void> insertRecord({
    required String date,
    required String session,
    required String status,
    required dynamic attendance,
    required String courseId,
    String? remarks,
  }) async {
    // Do nothing for mock
  }
}

class MockAcademicNotifier extends AcademicNotifier {
  MockAcademicNotifier(this.data);
  final AcademicState data;
  @override
  FutureOr<AcademicState> build() => data;
}

class MockNotificationNotifier extends NotificationsNotifier {
  MockNotificationNotifier(this.data);
  final NotificationsState data;
  @override
  Future<NotificationsState> build() async => data;
}

class MockSecurityFailureNotifier extends SecurityFailureNotifier {
  MockSecurityFailureNotifier(this.data);
  final SecurityFailureState? data;
  @override
  SecurityFailureState? build() => data;
}

class MockOutageNotifier extends OutageNotifier {
  MockOutageNotifier({required this.data});
  final bool data;
  @override
  bool build() => data;
}

class MockScoreNotifier extends ScoreNotifier {
  MockScoreNotifier(this.data);
  final ScoreState data;
  @override
  Future<ScoreState> build() async => data;
}

class MockLeaveNotifier extends LeaveNotifier {
  MockLeaveNotifier(this.data);
  final LeaveState data;
  @override
  FutureOr<LeaveState> build() => data;
}

DashboardData createMockDashboardData() {
  final courses = [
    const CourseDetails(
      id: 1,
      name: 'Test Course',
      code: 'TEST101',
      academicYear: '2025',
      academicSemester: '1',
    ),
  ];
  const attendance = AttendanceReportDetailed(
    studentAttendanceData: {
      '2025-05-16': {
        'TEST101': AttendanceSession(attendance: 'P', session: 'I'),
      },
    },
    courses: {
      'TEST101': AttendanceCourse(
        id: 1,
        name: 'Test Course',
        code: 'TEST101',
      ),
    },
    attendanceDates: {
      '2025-05-16': ['TEST101'],
    },
  );
  return DashboardData(
    courses: courses,
    attendance: attendance,
    tracking: [],
    stats: DashboardStats.calculate(
      attendanceData: attendance,
      trackingRecords: [],
      selectedSemester: '1',
      selectedYear: '2025',
    ),
    selectedSemester: '1',
    selectedYear: '2025',
  );
}

AuthenticatedUser createMockUser() {
  return AuthenticatedUser(
    supabaseUserId: 'u1',
    username: 'testuser',
    settings: UserSettings.defaults(),
    ezygoToken: EncryptedValue.fromPlaintext('testtoken'),
  );
}

ScoreState createMockScoreState() {
  return ScoreState(
    rawExams: [],
    groupedExams: [],
    questions: {},
    answers: {},
    resolvedScores: {},
    filterType: 'all',
    totalExams: 0,
    scoredCount: 0,
    pendingCount: 0,
  );
}

LeaveState createMockLeaveState() {
  return LeaveState(
    leaves: [],
    sessions: {},
  );
}
