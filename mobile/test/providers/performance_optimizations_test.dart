import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:mocktail/mocktail.dart';

import '../coverage_helper.dart';

class MockSecureStorageService extends Mock implements SecureStorageService {}

class MockApiService extends Mock implements ApiService {}

class DelayedTrackingNotifier extends TrackingNotifier {
  final Completer<TrackingState> completer = Completer<TrackingState>();
  @override
  FutureOr<TrackingState> build() {
    return completer.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(Duration.zero);
    registerFallbackValue(MockSecureStorageService());
    registerFallbackValue(Uri());
  });

  late MockSecureStorageService mockStorage;
  late MockApiService mockApi;

  setUp(() {
    mockStorage = MockSecureStorageService();
    mockApi = MockApiService();

    when(
      () => mockStorage.getCachedData(any<String>()),
    ).thenAnswer((_) async => null);
    when(
      () => mockStorage.saveCachedData(
        any<String>(),
        any<dynamic>(),
        ttl: any<Duration>(named: 'ttl'),
      ),
    ).thenAnswer((_) async {});

    when(() => mockApi.fetchExams(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(),
        data: <dynamic>[],
        statusCode: 200,
      ),
    );

    when(() => mockApi.fetchLeaveData(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(),
        data: <String, dynamic>{},
        statusCode: 200,
      ),
    );

    when(() => mockApi.fetchCourses(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(),
        data: <dynamic>[],
        statusCode: 200,
      ),
    );

    when(() => mockApi.fetchAttendanceReportDetailed(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(),
        data: <String, dynamic>{
          'student_attendance_data': <String, dynamic>{},
          'courses': <String, dynamic>{},
          'attendance_dates': <dynamic>[],
          'sessions': <dynamic>[],
        },
        statusCode: 200,
      ),
    );

    when(() => mockApi.fetchClassCourses(any())).thenAnswer((_) async => []);
    when(
      () => mockApi.fetchCourseInstructors(any()),
    ).thenAnswer((_) async => []);
  });

  group('Performance Optimizations', () {
    test(
      'StealthHeadersService caches StealthInfo in memory across consecutive calls',
      () async {
        final info = StealthInfo(
          browserName: 'Chrome',
          browserVersion: '141',
          userAgent: 'TestUA',
          secChUa: 'TestSecChUa',
        );

        when(() => mockStorage.getStealthInfo()).thenAnswer((_) async => info);

        final service = StealthHeadersService(mockStorage);

        final headers1 = await service.getHeaders(
          url: 'https://edu.ezygo.app/test',
        );
        expect(headers1['User-Agent'], 'TestUA');

        final headers2 = await service.getHeaders(
          url: 'https://edu.ezygo.app/test2',
        );
        expect(headers2['User-Agent'], 'TestUA');

        // Verify storage was read only once due to in-memory caching
        verify(() => mockStorage.getStealthInfo()).called(1);

        // Invalidate and verify it re-reads
        service.invalidateCache();
        await service.getHeaders(url: 'https://edu.ezygo.app/test3');
        verify(() => mockStorage.getStealthInfo()).called(1);
      },
    );

    test(
      'ScoreNotifier pre-filters exams to active academic period before detail loading',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const activeAcademic = AcademicState(semester: 'Odd', year: '2025');

        // Create 2 exams: 1 matching active semester, 1 from previous year
        final matchingExam = {
          'id': 1,
          'name': 'Active Exam',
          'academic_year': '2025',
          'academic_semester': 'Odd',
          'activity_type': 'exam',
          'course': [
            {
              'id': 10,
              'name': 'Course 1',
              'academic_year': '2025',
              'academic_semester': 'Odd',
            },
          ],
        };

        final historicalExam = {
          'id': 2,
          'name': 'Historical Exam',
          'academic_year': '2024',
          'academic_semester': 'Even',
          'activity_type': 'exam',
          'course': [
            {
              'id': 20,
              'name': 'Course 2',
              'academic_year': '2024',
              'academic_semester': 'Even',
            },
          ],
        };

        when(() => mockApi.fetchExams(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: [matchingExam, historicalExam],
            statusCode: 200,
          ),
        );

        when(() => mockApi.fetchExamQuestions(1, any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: <dynamic>[],
            statusCode: 200,
          ),
        );

        when(() => mockApi.fetchExamAnswers(1, any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: <dynamic>[],
            statusCode: 200,
          ),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(activeAcademic),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state = await container.read(scoreProvider.future);

        // Only matching exam (id: 1) should be in state
        expect(state.rawExams.length, 1);
        expect(state.rawExams.first.id, 1);

        // fetchExamQuestions and fetchExamAnswers must ONLY be called for exam 1
        verify(() => mockApi.fetchExamQuestions(1, any())).called(1);
        verify(() => mockApi.fetchExamAnswers(1, any())).called(1);

        // Verify historical exam 2 was NEVER queried (pre-filtering working!)
        verifyNever(() => mockApi.fetchExamQuestions(2, any()));
        verifyNever(() => mockApi.fetchExamAnswers(2, any()));

        container.dispose();
      },
    );

    test(
      'ScoreNotifier hydrates from disk cache instantly without network calls',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const activeAcademic = AcademicState(semester: 'Odd', year: '2025');

        final cachedExamJson = {
          'id': 10,
          'name': 'Cached Exam',
          'academic_year': '2025',
          'academic_semester': 'Odd',
          'activity_type': 'exam',
          'course': [
            {
              'id': 100,
              'name': 'Cached Course',
              'academic_year': '2025',
              'academic_semester': 'Odd',
            },
          ],
        };

        when(
          () => mockStorage.getCachedData(
            'scores_exams_${mockUser.supabaseUserId}',
          ),
        ).thenAnswer((_) async => [cachedExamJson]);

        when(
          () => mockStorage.getCachedData('exam_questions_10'),
        ).thenAnswer((_) async => <dynamic>[]);

        when(
          () => mockStorage.getCachedData('exam_answers_10'),
        ).thenAnswer((_) async => <dynamic>[]);

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(activeAcademic),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state = await container.read(scoreProvider.future);

        // Initial future completes with cached data immediately
        expect(state.rawExams.length, 1);
        expect(state.rawExams.first.id, 10);

        // Stale-while-revalidate triggers background fetch
        verify(() => mockApi.fetchExams(any())).called(1);

        container.dispose();
      },
    );

    test(
      'LeaveNotifier hydrates from disk cache instantly without waiting for network',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const activeAcademic = AcademicState(semester: 'Odd', year: '2025');

        final cachedLeavesRaw = {
          'studentLeaves': {
            'student_leaves': [
              {
                'id': 42,
                'student_id': 1,
                'created_at': '2025-05-16',
                'leave_reason': 'Cached Leave Reason',
                'usersubgroup': {
                  'id': 5,
                  'academic_semester': 'Odd',
                  'academic_year': '2025',
                },
              },
            ],
            'student_leave_sessions': <String, dynamic>{},
          },
        };

        when(
          () => mockStorage.getCachedData(
            'leaves_raw_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer((_) async => cachedLeavesRaw);

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(activeAcademic),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state = await container.read(leaveProvider.future);

        // Initial future completes with cached data immediately
        expect(state.leaves.length, 1);
        expect(state.leaves.first.id, 42);
        expect(state.leaves.first.leaveReason, 'Cached Leave Reason');

        // Stale-while-revalidate triggers background fetch
        verify(() => mockApi.fetchLeaveData(any())).called(1);

        container.dispose();
      },
    );

    test(
      'standardizeCourseCode uses pre-compiled whitespace regex cleanly',
      () {
        expect(standardizeCourseCode('  CS - 101 \u00A0'), 'CS101');
        expect(standardizeCourseCode('mat 202'), 'MAT202');
      },
    );

    test(
      'DashboardNotifier hydrates instantly from disk cache without waiting for tracking network requests',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const activeAcademic = AcademicState(semester: 'Odd', year: '2025');
        final delayedTracking = DelayedTrackingNotifier();

        final cachedCourse = {
          'id': 101,
          'name': 'Operating Systems',
          'code': 'CS302',
          'academic_semester': 'Odd',
          'academic_year': '2025',
        };

        final cachedAttendance = {
          'student_attendance_data': <String, dynamic>{},
          'courses': {
            'CS302': {
              'id': 101,
              'name': 'Operating Systems',
              'code': 'CS302',
            },
          },
          'attendance_dates': <dynamic>[],
          'sessions': <dynamic>[],
        };

        final cachedInstructor = {
          'course_code': 'CS302',
          'instructor_name': 'Dr. Alan Turing',
        };

        when(
          () => mockStorage.getCachedData(
            'dashboard_courses_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer((_) async => [cachedCourse]);
        when(
          () => mockStorage.getCachedData(
            'dashboard_attendance_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer((_) async => cachedAttendance);
        when(
          () => mockStorage.getCachedData(
            'dashboard_instructors_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer((_) async => [cachedInstructor]);
        when(
          () => mockStorage.getCachedData(
            'tracking_records_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer((_) async => <dynamic>[]);

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(activeAcademic),
            ),
            trackingProvider.overrideWith(() => delayedTracking),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        // Dashboard completes instantly from disk cache, even while tracking is still in-flight
        final dashboardFuture = container.read(dashboardProvider.future);
        final state = await dashboardFuture;

        expect(state.courses.length, 1);
        expect(state.courses.first.code, 'CS302');
        expect(state.instructors.first.instructorName, 'Dr. Alan Turing');
        expect(delayedTracking.completer.isCompleted, isFalse);

        // Allow microtask for silent revalidation to run
        await Future<void>.delayed(const Duration(milliseconds: 50));

        // Background revalidation was triggered with fresh attendance fetch
        verify(() => mockApi.fetchCourses(any())).called(1);
        verify(() => mockApi.fetchAttendanceReportDetailed(any())).called(1);

        container.dispose();
      },
    );

    test(
      'DashboardNotifier switches term and hydrates term-specific cache',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const term1 = AcademicState(semester: 'Odd', year: '2025');
        const term2 = AcademicState(semester: 'Even', year: '2025');

        when(
          () => mockStorage.getCachedData(
            'dashboard_courses_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer(
          (_) async => [
            {
              'id': 1,
              'name': 'Course Odd',
              'code': 'ODD101',
              'academic_semester': 'Odd',
              'academic_year': '2025',
            },
          ],
        );
        when(
          () => mockStorage.getCachedData(
            'dashboard_attendance_${mockUser.supabaseUserId}_Odd_2025',
          ),
        ).thenAnswer(
          (_) async => {
            'student_attendance_data': <String, dynamic>{},
            'courses': {
              'ODD101': {'id': 1, 'name': 'Course Odd', 'code': 'ODD101'},
            },
            'attendance_dates': <dynamic>[],
            'sessions': <dynamic>[],
          },
        );

        when(
          () => mockStorage.getCachedData(
            'dashboard_courses_${mockUser.supabaseUserId}_Even_2025',
          ),
        ).thenAnswer(
          (_) async => [
            {
              'id': 2,
              'name': 'Course Even',
              'code': 'EVEN201',
              'academic_semester': 'Even',
              'academic_year': '2025',
            },
          ],
        );
        when(
          () => mockStorage.getCachedData(
            'dashboard_attendance_${mockUser.supabaseUserId}_Even_2025',
          ),
        ).thenAnswer(
          (_) async => {
            'student_attendance_data': <String, dynamic>{},
            'courses': {
              'EVEN201': {'id': 2, 'name': 'Course Even', 'code': 'EVEN201'},
            },
            'attendance_dates': <dynamic>[],
            'sessions': <dynamic>[],
          },
        );

        final academicNotifier = MockAcademicNotifier(term1);
        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(() => academicNotifier),
            trackingProvider.overrideWith(
              () => DelayedTrackingNotifier()
                ..completer.complete(
                  TrackingState(
                    groupedByCourse: {},
                    totalCount: 0,
                    isSyncing: false,
                    syncCompleted: true,
                  ),
                ),
            ),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );

        final state1 = await container.read(dashboardProvider.future);
        expect(state1.courses.first.code, 'ODD101');

        // Switch to Even semester
        academicNotifier.updateState(term2);
        final state2 = await container.read(dashboardProvider.future);
        expect(state2.courses.first.code, 'EVEN201');

        container.dispose();
      },
    );
  });
}
