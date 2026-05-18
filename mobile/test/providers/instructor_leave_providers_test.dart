import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/instructor_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';

import '../coverage_helper.dart';

class MockSecureStorageService extends Mock implements SecureStorageService {}

class MockApiService extends Mock implements ApiService {}

class LoadingDashboardNotifier extends DashboardNotifier {
  @override
  FutureOr<DashboardData> build() => Completer<DashboardData>().future;
}

class ErrorDashboardNotifier extends DashboardNotifier {
  @override
  FutureOr<DashboardData> build() {
    state = AsyncValue.error(Exception('Dashboard Error'), StackTrace.empty);
    return Completer<DashboardData>().future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockSecureStorageService mockStorage;
  late MockApiService mockApi;

  setUp(() {
    mockStorage = MockSecureStorageService();
    mockApi = MockApiService();
  });

  group('instructorProvider Coverage', () {
    test('instructorProvider returns correct values for dashboard states', () {
      const instructor = CourseInstructor(
        id: 1,
        courseCode: 'CS101',
        instructorName: 'Dr. John',
      );

      final dashboardData = DashboardData(
        courses: [],
        attendance: const AttendanceReportDetailed(
          studentAttendanceData: {},
          courses: {},
          attendanceDates: {},
        ),
        tracking: [],
        stats: DashboardStats.calculate(
          attendanceData: const AttendanceReportDetailed(
            studentAttendanceData: {},
            courses: {},
            attendanceDates: {},
          ),
          trackingRecords: [],
          selectedSemester: 'Odd',
          selectedYear: '2025',
        ),
        selectedSemester: 'Odd',
        selectedYear: '2025',
        instructors: [instructor],
      );

      final container = ProviderContainer(
        overrides: [
          dashboardProvider.overrideWith(
            () => MockDashboardNotifier(dashboardData),
          ),
        ],
      );

      // Matches course ID
      final match = container.read(instructorProvider('CS101'));
      expect(match, instructor);

      // Does not match
      final mismatch = container.read(instructorProvider('CS102'));
      expect(mismatch, isNull);

      container.dispose();
    });

    test('instructorProvider returns null on loading/error', () async {
      final containerLoading = ProviderContainer(
        overrides: [
          dashboardProvider.overrideWith(LoadingDashboardNotifier.new),
        ],
      );
      final resLoading = containerLoading.read(instructorProvider('CS101'));
      expect(resLoading, isNull);

      try {
        containerLoading.dispose();
      } on Object catch (_) {
        // Ignored
      }

      final containerError = ProviderContainer(
        overrides: [
          dashboardProvider.overrideWith(ErrorDashboardNotifier.new),
        ],
      );

      final resError = containerError.read(instructorProvider('CS101'));
      expect(resError, isNull);

      containerError.dispose();
    });
  });

  group('leaveProvider & LeaveNotifier Coverage', () {
    test('Empty leave state factory works', () {
      final emptyState = LeaveState.empty();
      expect(emptyState.leaves, isEmpty);
      expect(emptyState.sessions, isEmpty);
    });

    test(
      'returns LeaveState.empty() when auth state or academic state is null',
      () async {
        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(null)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                const AcademicState(semester: '', year: ''),
              ),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final res = await container.read(leaveProvider.future);
        expect(res.leaves, isEmpty);
        container.dispose();
      },
    );

    test(
      'returns incomplete future when auth user isSyncing is true',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: true);

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                const AcademicState(semester: 'Odd', year: '2025'),
              ),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state = container.read(leaveProvider);
        expect(state, isA<AsyncLoading<LeaveState>>());

        try {
          container.dispose();
        } on Object catch (_) {
          // ignore disposed during loading exception
        }
      },
    );

    test(
      'successfully fetches and maps leave and session data matching academic context',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const mockAcademic = AcademicState(semester: 'Odd', year: '2025');

        final rawLeavesPayload = {
          'studentLeaves': {
            'student_leaves': [
              {
                'id': 100,
                'student_id': 1,
                'created_at': '2025-05-16',
                'leave_reason': 'Medical',
                'usersubgroup': {
                  'id': 10,
                  'academic_semester': 'Odd',
                  'academic_year': '2025',
                },
              },
              {
                'id': 200,
                'student_id': 1,
                'created_at': '2025-05-16',
                'leave_reason': 'Other',
                'usersubgroup': {
                  'id': 20,
                  'academic_semester': 'Even', // should filter out
                  'academic_year': '2025',
                },
              },
            ],
            'student_leave_sessions': {
              '100': [
                {
                  'id': 1001,
                  'student_leave_id': 100,
                  'date': '2025-05-16',
                  'session_name': 'Slot 1',
                },
              ],
              'invalid_key': [
                {
                  'id': 1002,
                  'student_leave_id': 100,
                  'date': '2025-05-16',
                },
              ],
            },
          },
        };

        registerFallbackValue(mockStorage);

        when(() => mockApi.fetchLeaveData(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: rawLeavesPayload,
            statusCode: 200,
          ),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(mockAcademic),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state = await container.read(leaveProvider.future);

        expect(state.leaves, hasLength(1));
        expect(state.leaves.first.id, 100);
        expect(state.leaves.first.leaveReason, 'Medical');

        expect(state.sessions, hasLength(1));
        expect(state.sessions[100], hasLength(1));
        expect(state.sessions[100]?.first.id, 1001);

        // Trigger refresh
        final notifier = container.read(leaveProvider.notifier);
        await notifier.refresh();

        container.dispose();
      },
    );
  });
}
