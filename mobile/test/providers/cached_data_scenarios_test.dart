import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

import '../coverage_helper.dart';

class MockSecureStorageService extends Mock implements SecureStorageService {}

class MockApiService extends Mock implements ApiService {}

class MockSupabaseClient extends Mock implements supabase.SupabaseClient {}

class MockGoTrueClient extends Mock implements supabase.GoTrueClient {}

class MockSession extends Mock implements supabase.Session {}

class TestAcademicNotifier extends AcademicNotifier {
  TestAcademicNotifier(this._state);
  AcademicState _state;

  @override
  FutureOr<AcademicState> build() => _state;

  @override
  void updateState(AcademicState? next) {
    if (next != null) {
      _state = next;
    }
    super.updateState(next);
  }

  void changeState(AcademicState next) {
    _state = next;
    state = AsyncValue.data(next);
  }
}

class TestTrackingNotifier extends TrackingNotifier {
  TestTrackingNotifier([TrackingState? initial])
    : _state =
          initial ??
          TrackingState(
            groupedByCourse: {},
            totalCount: 0,
            isSyncing: false,
            syncCompleted: true,
          );

  final TrackingState _state;

  @override
  FutureOr<TrackingState> build() => _state;
}

final class InvalidationObserver extends ProviderObserver {
  final disposedProviders = <Object>[];

  @override
  void didDisposeProvider(ProviderObserverContext context) {
    disposedProviders.add(context.provider);
    super.didDisposeProvider(context);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(Duration.zero);
    registerFallbackValue(MockSecureStorageService());
    registerFallbackValue(Uri());
    registerFallbackValue(const AcademicState(semester: 'Odd', year: '2025'));
    registerFallbackValue(UserSettings.defaults());
    registerFallbackValue(const UserProfile());
  });

  late MockSecureStorageService mockStorage;
  late MockApiService mockApi;
  late MockSupabaseClient mockSupabase;
  late MockGoTrueClient mockAuth;
  late MockSession mockSession;

  setUp(() {
    mockStorage = MockSecureStorageService();
    mockApi = MockApiService();
    mockSupabase = MockSupabaseClient();
    mockAuth = MockGoTrueClient();
    mockSession = MockSession();

    when(() => mockSupabase.auth).thenReturn(mockAuth);
    when(() => mockAuth.currentSession).thenReturn(mockSession);
    when(() => mockSession.accessToken).thenReturn('test-token');
    when(() => mockSession.isExpired).thenReturn(false);

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
    when(() => mockStorage.clearAllCachedData()).thenAnswer((_) async {});
    when(() => mockStorage.saveAcademicState(any())).thenAnswer((_) async {});
    when(() => mockStorage.getAcademicState()).thenAnswer((_) async => null);

    when(() => mockStorage.saveUsername(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveTermsVersion(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveEzygoUserId(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveEzygoToken(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveSupabaseUserId(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveSettings(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveUserProfile(any())).thenAnswer((_) async {});

    when(() => mockApi.clearCaches()).thenReturn(null);
    when(() => mockApi.fetchClassCourses(any())).thenAnswer((_) async => []);
    when(
      () => mockApi.fetchCourseInstructors(any()),
    ).thenAnswer((_) async => []);
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
  });

  group('Scenario 1: Background EzyGo data differs -> updated', () {
    test(
      'Dashboard hydrates from cache, performs silent revalidation with fresh server data, and updates state and disk cache',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const academic = AcademicState(semester: 'Odd', year: '2025');
        final suffix = '${mockUser.supabaseUserId}_Odd_2025';

        // 1. Initial cached data (10 present out of 12)
        final cachedCourses = [
          {
            'id': 101,
            'name': 'Operating Systems',
            'code': 'CS302',
            'academic_semester': 'Odd',
            'academic_year': '2025',
          },
        ];

        final cachedAttendance = {
          'student_attendance_data': {
            '2025-01-10': {
              '1': {'course': 'CS302', 'attendance': 110, 'session': 1},
              '2': {'course': 'CS302', 'attendance': 111, 'session': 2},
            },
          },
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

        when(
          () => mockStorage.getCachedData('dashboard_courses_$suffix'),
        ).thenAnswer((_) async => cachedCourses);
        when(
          () => mockStorage.getCachedData('dashboard_attendance_$suffix'),
        ).thenAnswer((_) async => cachedAttendance);
        when(
          () => mockStorage.getCachedData('dashboard_instructors_$suffix'),
        ).thenAnswer((_) async => <dynamic>[]);
        when(
          () => mockStorage.getCachedData('tracking_records_$suffix'),
        ).thenAnswer((_) async => <dynamic>[]);

        // 2. Fresh server response with updated attendance (3 present out of 4)
        final freshAttendance = {
          'student_attendance_data': {
            '2025-01-10': {
              '1': {'course': 'CS302', 'attendance': 110, 'session': 1},
              '2': {'course': 'CS302', 'attendance': 111, 'session': 2},
            },
            '2025-01-11': {
              '1': {'course': 'CS302', 'attendance': 110, 'session': 1},
              '2': {'course': 'CS302', 'attendance': 110, 'session': 2},
            },
          },
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

        when(() => mockApi.fetchCourses(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: cachedCourses,
            statusCode: 200,
          ),
        );

        when(() => mockApi.fetchAttendanceReportDetailed(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: freshAttendance,
            statusCode: 200,
          ),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(academic),
            ),
            trackingProvider.overrideWith(TestTrackingNotifier.new),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );
        addTearDown(container.dispose);

        // Instant boot from cache
        final initialData = await container.read(dashboardProvider.future);
        expect(initialData.courses.first.code, 'CS302');
        final initialStat = initialData.stats.courseStats['CS302'];
        expect(initialStat?.officialPresent, 1);
        expect(initialStat?.officialTotal, 2);

        // Allow microtask silent revalidation to run and complete
        await Future<void>.delayed(const Duration(milliseconds: 60));

        // State has been updated with fresh server attendance data!
        final updatedState = container.read(dashboardProvider).value;
        expect(updatedState, isNotNull);
        final updatedStat = updatedState!.stats.courseStats['CS302'];
        expect(updatedStat?.officialPresent, 3);
        expect(updatedStat?.officialTotal, 4);

        // Verify updated attendance was persisted back to disk cache
        verify(
          () => mockStorage.saveCachedData(
            'dashboard_attendance_$suffix',
            any<dynamic>(),
          ),
        ).called(1);
      },
    );
  });

  group('Scenario 2: Background sem/year changes -> purged and reload', () {
    test(
      'ProfileHydrationService detects academic rollover, clears API and disk caches, updates academic state, and invalidates screen providers',
      () async {
        final observer = InvalidationObserver();
        final mockUser = createMockUser().copyWith(
          isSyncing: false,
          profile: const UserProfile(
            firstName: 'Test',
            currentSemester: 'Odd',
            currentYear: '2024-25',
          ),
        );

        when(() => mockStorage.getAcademicState()).thenAnswer(
          (_) async => const AcademicState(semester: 'Odd', year: '2024-25'),
        );
        when(() => mockStorage.saveEzygoToken(any())).thenAnswer((_) async {});
        when(
          () => mockStorage.saveSupabaseUserId(any()),
        ).thenAnswer((_) async {});
        when(() => mockStorage.saveSettings(any())).thenAnswer((_) async {});
        when(() => mockStorage.saveUserProfile(any())).thenAnswer((_) async {});

        final container = ProviderContainer(
          observers: [observer],
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => TestAcademicNotifier(
                const AcademicState(semester: 'Odd', year: '2024-25'),
              ),
            ),
            trackingProvider.overrideWith(TestTrackingNotifier.new),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
            supabaseClientProvider.overrideWith((ref) => mockSupabase),
          ],
        );
        addTearDown(container.dispose);

        // Activate providers
        container
          ..read(dashboardProvider)
          ..read(trackingProvider)
          ..read(leaveProvider)
          ..read(scoreProvider)
          ..read(notificationsProvider);

        observer.disposedProviders.clear();

        final hydrationService = container.read(
          profileHydrationServiceProvider.notifier,
        );

        // Server returns updated academic period: Even 2024-25
        final serverProfilePayload = {
          'profile': {
            'first_name': 'Test',
            'current_semester': 'Even',
            'current_year': '2024-25',
          },
          'current_semester': 'Even',
          'current_year': '2024-25',
          'settings': mockUser.settings.toJson(),
        };

        await hydrationService.applyProfileResponseData(
          currentUser: mockUser,
          data: serverProfilePayload,
        );

        // 1. API in-memory caches must be cleared
        verify(() => mockApi.clearCaches()).called(1);

        // 2. Storage disk cache must be cleared
        verify(() => mockStorage.clearAllCachedData()).called(1);

        // 3. New academic state must be persisted
        verify(
          () => mockStorage.saveAcademicState(
            const AcademicState(semester: 'Even', year: '2024-25'),
          ),
        ).called(greaterThanOrEqualTo(1));

        // 4. academicProvider must be updated to new term
        expect(
          container.read(academicProvider).value,
          const AcademicState(semester: 'Even', year: '2024-25'),
        );

        // 5. All screen providers must be invalidated
        expect(observer.disposedProviders.contains(dashboardProvider), isTrue);
        expect(observer.disposedProviders.contains(trackingProvider), isTrue);
        expect(observer.disposedProviders.contains(leaveProvider), isTrue);
        expect(observer.disposedProviders.contains(scoreProvider), isTrue);
        expect(
          observer.disposedProviders.contains(notificationsProvider),
          isTrue,
        );
      },
    );
  });

  group('Scenario 3: Cron sync changes data -> updated', () {
    test(
      'handleCronSyncResult clears ApiService caches and invalidates all screen providers when hasChanges is true',
      () {
        final observer = InvalidationObserver();
        final container = ProviderContainer(
          observers: [observer],
          overrides: [
            apiServiceProvider.overrideWith((ref) => mockApi),
          ],
        );
        addTearDown(container.dispose);

        // Activate providers
        container
          ..read(dashboardProvider)
          ..read(trackingProvider)
          ..read(leaveProvider)
          ..read(scoreProvider)
          ..read(notificationsProvider);

        observer.disposedProviders.clear();

        final hydrationService = container.read(
          profileHydrationServiceProvider.notifier,
        );

        const syncResultWithChanges = CronSyncResult(
          success: true,
          processed: 5,
          deletions: 1,
          conflicts: 0,
          updates: 2,
          errors: 0,
        );

        hydrationService.handleCronSyncResult(syncResultWithChanges);

        // Verify API cache was cleared
        verify(() => mockApi.clearCaches()).called(1);

        // Verify all screens were invalidated for fresh reload
        expect(observer.disposedProviders.contains(dashboardProvider), isTrue);
        expect(observer.disposedProviders.contains(trackingProvider), isTrue);
        expect(observer.disposedProviders.contains(leaveProvider), isTrue);
        expect(observer.disposedProviders.contains(scoreProvider), isTrue);
        expect(
          observer.disposedProviders.contains(notificationsProvider),
          isTrue,
        );
      },
    );

    test(
      'handleCronSyncResult does not invalidate or clear cache when hasChanges is false',
      () {
        final observer = InvalidationObserver();
        final container = ProviderContainer(
          observers: [observer],
          overrides: [
            apiServiceProvider.overrideWith((ref) => mockApi),
          ],
        );
        addTearDown(container.dispose);

        container
          ..read(dashboardProvider)
          ..read(trackingProvider);

        observer.disposedProviders.clear();

        final hydrationService = container.read(
          profileHydrationServiceProvider.notifier,
        );

        const syncResultNoChanges = CronSyncResult(
          success: true,
          processed: 5,
          deletions: 0,
          conflicts: 0,
          updates: 0,
          errors: 0,
        );

        hydrationService.handleCronSyncResult(syncResultNoChanges);

        verifyNever(() => mockApi.clearCaches());
        expect(observer.disposedProviders.isEmpty, isTrue);
      },
    );
  });

  group('Scenario 4: Network drops, partial queries, retries & edge cases', () {
    test(
      'Network drop during background silent revalidation preserves cached state and does not emit error to UI',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const academic = AcademicState(semester: 'Odd', year: '2025');
        final suffix = '${mockUser.supabaseUserId}_Odd_2025';

        final cachedCourses = [
          {
            'id': 201,
            'name': 'Algorithms',
            'code': 'CS201',
            'academic_semester': 'Odd',
            'academic_year': '2025',
          },
        ];

        final cachedAttendance = {
          'student_attendance_data': {
            'CS201': {
              'present': 15,
              'absent': 3,
              'total': 18,
              'percentage': 83.33,
            },
          },
          'courses': {
            'CS201': {
              'id': 201,
              'name': 'Algorithms',
              'code': 'CS201',
            },
          },
          'attendance_dates': <dynamic>[],
          'sessions': <dynamic>[],
        };

        when(
          () => mockStorage.getCachedData('dashboard_courses_$suffix'),
        ).thenAnswer((_) async => cachedCourses);
        when(
          () => mockStorage.getCachedData('dashboard_attendance_$suffix'),
        ).thenAnswer((_) async => cachedAttendance);
        when(
          () => mockStorage.getCachedData('dashboard_instructors_$suffix'),
        ).thenAnswer((_) async => <dynamic>[]);
        when(
          () => mockStorage.getCachedData('tracking_records_$suffix'),
        ).thenAnswer((_) async => <dynamic>[]);

        // Simulate network drop during background revalidation
        when(() => mockApi.fetchCourses(any())).thenThrow(
          DioException.connectionError(
            requestOptions: RequestOptions(),
            reason: 'Network connection dropped',
          ),
        );
        when(() => mockApi.fetchAttendanceReportDetailed(any())).thenThrow(
          DioException.connectionError(
            requestOptions: RequestOptions(),
            reason: 'Network connection dropped',
          ),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(academic),
            ),
            trackingProvider.overrideWith(TestTrackingNotifier.new),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );
        addTearDown(container.dispose);

        // Initial future completes cleanly with cached data
        final state = await container.read(dashboardProvider.future);
        expect(state.courses.first.code, 'CS201');

        // Allow microtask silent revalidation to run and catch network drop
        await Future<void>.delayed(const Duration(milliseconds: 60));

        // State remains valid data and does NOT enter error state!
        final currentState = container.read(dashboardProvider);
        expect(currentState.hasError, isFalse);
        expect(currentState.hasValue, isTrue);
        expect(currentState.value?.courses.first.code, 'CS201');
      },
    );

    test(
      'Partial query failure in secondary enrichment queries (class courses/instructors) falls back gracefully without failing primary dashboard',
      () async {
        final mockUser = createMockUser().copyWith(
          isSyncing: false,
          profile: UserProfile(
            classField: UserClass(id: 'class-abc-123', name: 'CSE-A'),
          ),
        );
        const academic = AcademicState(semester: 'Odd', year: '2025');

        final officialCourses = [
          {
            'id': 301,
            'name': 'Database Systems',
            'code': 'CS301',
            'academic_semester': 'Odd',
            'academic_year': '2025',
          },
        ];

        final officialAttendance = {
          'student_attendance_data': {
            'CS301': {
              'present': 20,
              'absent': 2,
              'total': 22,
              'percentage': 90.9,
            },
          },
          'courses': {
            'CS301': {
              'id': 301,
              'name': 'Database Systems',
              'code': 'CS301',
            },
          },
          'attendance_dates': <dynamic>[],
          'sessions': <dynamic>[],
        };

        when(() => mockApi.fetchCourses(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: officialCourses,
            statusCode: 200,
          ),
        );

        when(() => mockApi.fetchAttendanceReportDetailed(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: officialAttendance,
            statusCode: 200,
          ),
        );

        // Secondary queries fail (e.g. Supabase socket exception)
        when(() => mockApi.fetchClassCourses('class-abc-123')).thenAnswer(
          (_) => Future.error(Exception('Supabase connection refused')),
        );
        when(() => mockApi.fetchCourseInstructors('class-abc-123')).thenAnswer(
          (_) => Future.error(Exception('Supabase connection refused')),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(academic),
            ),
            trackingProvider.overrideWith(TestTrackingNotifier.new),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );
        addTearDown(container.dispose);

        // Dashboard completes successfully with core data despite secondary query failures
        final data = await container.read(dashboardProvider.future);
        expect(data.courses.length, 1);
        expect(data.courses.first.code, 'CS301');
        expect(data.instructors.isEmpty, isTrue);
      },
    );

    test(
      'Retry after initial failure: clearing cache and retrying fetches successfully',
      () async {
        final mockUser = createMockUser().copyWith(isSyncing: false);
        const academic = AcademicState(semester: 'Odd', year: '2025');

        var attempt = 0;
        when(() => mockApi.fetchCourses(any())).thenAnswer((_) async {
          attempt++;
          if (attempt == 1) {
            throw DioException.connectionError(
              requestOptions: RequestOptions(),
              reason: 'Initial network failure',
            );
          }
          return Response(
            requestOptions: RequestOptions(),
            data: [
              {
                'id': 401,
                'name': 'Compiler Design',
                'code': 'CS401',
                'academic_semester': 'Odd',
                'academic_year': '2025',
              },
            ],
            statusCode: 200,
          );
        });

        when(() => mockApi.fetchAttendanceReportDetailed(any())).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(),
            data: {
              'student_attendance_data': <String, dynamic>{},
              'courses': {
                'CS401': {
                  'id': 401,
                  'name': 'Compiler Design',
                  'code': 'CS401',
                },
              },
              'attendance_dates': <dynamic>[],
              'sessions': <dynamic>[],
            },
            statusCode: 200,
          ),
        );

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(academic),
            ),
            trackingProvider.overrideWith(TestTrackingNotifier.new),
            apiServiceProvider.overrideWith((ref) => mockApi),
            secureStorageProvider.overrideWith((ref) => mockStorage),
          ],
        );
        addTearDown(container.dispose);

        // Attempt 1 fails: listen captures error state with DioException immediately
        final attempt1Completer = Completer<AsyncValue<DashboardData>>();
        final sub = container.listen<AsyncValue<DashboardData>>(
          dashboardProvider,
          (previous, next) {
            if (!attempt1Completer.isCompleted && next.hasError) {
              attempt1Completer.complete(next);
            }
          },
          fireImmediately: true,
        );
        addTearDown(sub.close);

        final firstState = await attempt1Completer.future;
        expect(firstState.hasError, isTrue);
        expect(firstState.error, isA<DioException>());

        // User hits Retry: clear cache and invalidate dashboard
        mockApi.clearCaches();
        container.invalidate(dashboardProvider);

        // Attempt 2 succeeds with fresh data
        final data = await container.read(dashboardProvider.future);
        expect(data.courses.first.code, 'CS401');
      },
    );
  });
}
