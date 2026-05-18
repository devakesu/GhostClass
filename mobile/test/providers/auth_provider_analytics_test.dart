import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

class MockApiService extends Mock implements ApiService {}

class MockSecureStorageService extends Mock implements SecureStorageService {}

class MockSupabaseClient extends Mock implements supabase.SupabaseClient {}

class MockGoTrueClient extends Mock implements supabase.GoTrueClient {}

class MockSession extends Mock implements supabase.Session {}

class MockAuthResponse extends Mock implements supabase.AuthResponse {}

class MockSupabaseUser extends Mock implements supabase.User {}

class MockProfileService extends Mock implements ProfileService {}

class MockSettingsService extends Mock implements SettingsService {}

class _UserSettingsFake extends Fake implements UserSettings {}

void main() {
  late MockFirebaseAnalytics mockAnalytics;
  late MockApiService mockApi;
  late MockSecureStorageService mockStorage;
  late MockSupabaseClient mockSupabase;
  late MockGoTrueClient mockAuth;
  late MockSession mockSession;
  late MockAuthResponse mockAuthResponse;
  late MockSupabaseUser mockUser;
  late MockProfileService mockProfileService;
  late MockSettingsService mockSettingsService;
  late supabase.Session? currentSession;

  ProviderContainer buildContainer() {
    return ProviderContainer(
      overrides: [
        apiServiceProvider.overrideWithValue(mockApi),
        secureStorageProvider.overrideWithValue(mockStorage),
        supabaseClientProvider.overrideWithValue(mockSupabase),
        profileServiceProvider.overrideWithValue(mockProfileService),
        settingsServiceProvider.overrideWithValue(mockSettingsService),
      ],
    );
  }

  Future<void> initAnalytics() async {
    AnalyticsService.resetForTest();
    when(
      () => mockAnalytics.setUserProperty(
        name: any(named: 'name'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => mockAnalytics.logAppOpen(parameters: any(named: 'parameters')),
    ).thenAnswer((_) async {});
    when(
      () => mockAnalytics.logEvent(
        name: any(named: 'name'),
        parameters: any(named: 'parameters'),
      ),
    ).thenAnswer((_) async {});
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);
  }

  setUp(() {
    mockAnalytics = MockFirebaseAnalytics();
    mockApi = MockApiService();
    mockStorage = MockSecureStorageService();
    mockSupabase = MockSupabaseClient();
    mockAuth = MockGoTrueClient();
    mockSession = MockSession();
    mockAuthResponse = MockAuthResponse();
    mockUser = MockSupabaseUser();
    mockProfileService = MockProfileService();
    mockSettingsService = MockSettingsService();
    currentSession = null;

    when(
      () => mockApi.onUnauthorized,
    ).thenAnswer((_) => const Stream<void>.empty());
    when(() => mockApi.onSecurityLockdown).thenAnswer(
      (_) => const Stream<Map<String, String>>.empty(),
    );
    when(() => mockApi.clearCaches()).thenReturn(null);
    when(
      () => mockApi.refreshProfile(
        any(),
        sync: any(named: 'sync'),
      ),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(path: '/profile'),
        statusCode: 200,
        data: {
          'profile': {'first_name': 'Test'},
          'settings': {
            'bunk_calculator_enabled': true,
            'target_percentage': 75,
            'disabled_courses': <String, String>{},
          },
          'ezygo_token': 'ezygo-token',
        },
      ),
    );

    when(() => mockSupabase.auth).thenReturn(mockAuth);
    when(() => mockAuth.currentSession).thenAnswer((_) => currentSession);
    when(() => mockAuth.signOut()).thenAnswer((_) async {});
    when(
      () => mockAuth.setSession(any()),
    ).thenAnswer((_) async => mockAuthResponse);
    when(() => mockAuthResponse.user).thenReturn(mockUser);
    when(() => mockUser.id).thenReturn('supabase-user');
    when(() => mockSession.isExpired).thenReturn(false);
    when(() => mockSession.accessToken).thenReturn('supabase-access-token');

    when(() => mockStorage.getSupabaseUserId()).thenAnswer((_) async => null);
    when(() => mockStorage.getEzygoUserId()).thenAnswer((_) async => null);
    when(() => mockStorage.getUsername()).thenAnswer((_) async => null);
    when(() => mockStorage.getTermsVersion()).thenAnswer((_) async => null);
    when(() => mockStorage.getSettings()).thenAnswer((_) async => null);
    when(() => mockStorage.getUserProfile()).thenAnswer(
      (_) async => const UserProfile(firstName: 'Test'),
    );
    when(() => mockStorage.saveEzygoToken(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveSupabaseUserId(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveUsername(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveSettings(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveUserProfile(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveEzygoUserId(any())).thenAnswer((_) async {});
    when(() => mockStorage.saveTermsVersion(any())).thenAnswer((_) async {});
    when(() => mockStorage.clearAll()).thenAnswer((_) async {});

    when(
      () => mockProfileService.hasRenderableLocalProfile(any()),
    ).thenReturn(true);
    when(
      () => mockSettingsService.saveSettingsLocally(any()),
    ).thenAnswer((_) async {});
    when(
      () => mockSettingsService.updateSettings(
        any(),
        bunkEnabled: any(named: 'bunkEnabled'),
        targetPercentage: any(named: 'targetPercentage'),
        disabledCourses: any(named: 'disabledCourses'),
      ),
    ).thenAnswer((_) async {});
  });

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    registerFallbackValue(_UserSettingsFake());
    registerFallbackValue(const UserProfile(firstName: 'Fallback'));
    registerFallbackValue(
      const AcademicState(semester: 'Odd', year: '2025-2026'),
    );
  });

  test(
    'login logs analytics and accepts a successful bridge session',
    () async {
      await initAnalytics();

      when(
        () => mockApi.loginAndProvision(
          username: any(named: 'username'),
          password: any(named: 'password'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/auth'),
          statusCode: 200,
          data: {
            'session': {'refresh_token': 'refresh-token'},
            'settings': {
              'bunk_calculator_enabled': true,
              'target_percentage': 75,
              'disabled_courses': <String, String>{},
            },
            'id': 'ezygo-id',
            'ezygo_token': 'ezygo-token',
            'current_semester': 'Odd',
            'current_year': '2025-2026',
          },
        ),
      );

      final container = buildContainer();
      addTearDown(container.dispose);
      final notifier = container.read(authProvider.notifier);

      currentSession = mockSession;

      await notifier.login('student', 'password');
      await Future<void>.delayed(Duration.zero);

      final verification = verify(
        () => mockAnalytics.logEvent(
          name: 'login',
          parameters: captureAny(named: 'parameters'),
        ),
      );
      final params = verification.captured.single as Map<String, Object?>;
      expect(params['method'], 'ezygo');
      expect(params['env'], anyOf('development', 'production'));
    },
  );

  test(
    'acceptTerms logs analytics and persists the selected version',
    () async {
      await initAnalytics();

      final container = buildContainer();
      addTearDown(container.dispose);
      final notifier = container.read(authProvider.notifier);
      currentSession = mockSession;
      when(() => mockApi.acceptTerms(any(), any())).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/accept-terms'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );
      notifier.state = AsyncValue.data(
        AuthenticatedUser(
          supabaseUserId: 'supabase-user',
          ezygoToken: EncryptedValue.fromPlaintext('ezygo-token'),
          settings: UserSettings.defaults(),
          profile: const UserProfile(firstName: 'Test'),
        ),
      );

      await notifier.acceptTerms();

      verify(
        () => mockStorage.saveTermsVersion(AppConfig.termsVersion),
      ).called(1);
      final verification = verify(
        () => mockAnalytics.logEvent(
          name: 'accept_terms',
          parameters: captureAny(named: 'parameters'),
        ),
      );
      final params = verification.captured.single as Map<String, Object?>;
      expect(params['version'], AppConfig.termsVersion);
      expect(params['env'], anyOf('development', 'production'));
    },
  );

  test('updateSettings logs analytics for changed settings', () async {
    await initAnalytics();

    final container = buildContainer();
    addTearDown(container.dispose);
    final notifier = container.read(authProvider.notifier);
    // Seed the notifier state for this focused analytics assertion.
    // ignore: cascade_invocations
    notifier.state = AsyncValue.data(
      AuthenticatedUser(
        supabaseUserId: 'supabase-user',
        ezygoToken: EncryptedValue.fromPlaintext('ezygo-token'),
        settings: UserSettings.defaults(),
        profile: const UserProfile(firstName: 'Test'),
      ),
    );

    await notifier.updateSettings(
      bunkEnabled: false,
      targetPercentage: 80,
      disabledCourses: <String, Map<String, String>>{
        '2025-2026': <String, String>{'CSE101': '1'},
      },
    );

    final verification = verify(
      () => mockAnalytics.logEvent(
        name: 'settings_updated',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final params = verification.captured.single as Map<String, Object?>;
    expect(params['bunkCalculatorEnabled'], false);
    expect(params['targetPercentage'], 80);
    expect(params['disabledCoursesCount'], 1);
    expect(params['env'], anyOf('development', 'production'));
  });

  test('logout logs analytics and clears stored data', () async {
    await initAnalytics();

    final container = buildContainer();
    addTearDown(container.dispose);
    final notifier = container.read(authProvider.notifier);

    await notifier.logout();

    verify(() => mockApi.clearCaches()).called(1);
    verify(() => mockStorage.clearAll()).called(1);
    verify(() => mockAuth.signOut()).called(1);
    final verification = verify(
      () => mockAnalytics.logEvent(
        name: 'logout',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final params = verification.captured.single as Map<String, Object?>;
    expect(params['env'], anyOf('development', 'production'));
  });

  test('login handles bridge response with multiple fields', () async {
    // This test verifies bridge response handling for the debug logging path
    await initAnalytics();

    when(
      () => mockApi.loginAndProvision(
        username: any(named: 'username'),
        password: any(named: 'password'),
      ),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(path: '/auth'),
        statusCode: 200,
        data: {
          'session': {'refresh_token': 'refresh-token'},
          'settings': {
            'bunk_calculator_enabled': true,
            'target_percentage': 75,
            'disabled_courses': <String, String>{},
          },
          'id': 'ezygo-id',
          'ezygo_token': 'ezygo-token',
          'current_semester': 'Odd',
          'current_year': '2025-2026',
          'field1': 'value1',
          'field2': 'value2',
          'field3': 'value3',
        },
      ),
    );

    final container = buildContainer();
    addTearDown(container.dispose);
    final notifier = container.read(authProvider.notifier);

    currentSession = mockSession;

    // This exercises the bridge response handling code path
    await notifier.login('student', 'password');
    await Future<void>.delayed(Duration.zero);

    // Verify the state was updated correctly
    final state = container.read(authProvider);
    expect(state.isLoading, isFalse);
  });

  test(
    'updateAcademicContext updates profile and clears syncing flag',
    () async {
      await initAnalytics();

      final container = buildContainer();
      addTearDown(container.dispose);
      final notifier = container.read(authProvider.notifier);
      currentSession = mockSession;

      notifier.state = AsyncValue.data(
        AuthenticatedUser(
          supabaseUserId: 'supabase-user',
          ezygoToken: EncryptedValue.fromPlaintext('ezygo-token'),
          settings: UserSettings.defaults(),
          profile: UserProfile(
            firstName: 'Before',
            classField: UserClass(id: 'class-1', name: 'Class A'),
          ),
        ),
      );

      when(
        () => mockStorage.getAcademicState(),
      ).thenAnswer((_) async => null);
      when(
        () => mockStorage.saveAcademicState(any()),
      ).thenAnswer((_) async {});
      when(
        () => mockApi.updateSemester(any(), mockStorage),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/semester'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );
      when(
        () => mockApi.updateAcademicYear(any(), mockStorage),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/year'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );
      when(
        () => mockApi.triggerSync(any(), force: any(named: 'force')),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/sync'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );

      var refreshCount = 0;
      when(
        () => mockApi.refreshProfile(
          any(),
          sync: any(named: 'sync'),
          force: any(named: 'force'),
        ),
      ).thenAnswer((invocation) async {
        refreshCount += 1;
        final sync = invocation.namedArguments[#sync] as bool? ?? false;
        final firstName = sync ? 'Synced' : 'Final';
        return Response<dynamic>(
          requestOptions: RequestOptions(path: '/profile'),
          statusCode: 200,
          data: {
            'profile': {
              'first_name': firstName,
              'class': {'id': 'class-2', 'name': 'Class B'},
            },
            'settings': {
              'bunk_calculator_enabled': true,
              'target_percentage': 75,
              'disabled_courses': <String, String>{},
            },
            'ezygo_token': 'ezygo-token',
          },
        );
      });

      await notifier.updateAcademicContext('Even', '2025-2026');

      verify(() => mockApi.clearCaches()).called(1);
      verify(() => mockApi.triggerSync(any(), force: true)).called(1);
      expect(refreshCount, equals(1));

      final user = container.read(authProvider).value;
      expect(user, isNotNull);
      expect(user!.isSyncing, isFalse);
      expect(user.profile?.firstName, equals('Synced'));
    },
  );

  test(
    'updateAcademicContext does not logout for non-critical security 401',
    () async {
      await initAnalytics();

      final container = buildContainer();
      addTearDown(container.dispose);
      final notifier = container.read(authProvider.notifier);
      currentSession = mockSession;

      notifier.state = AsyncValue.data(
        AuthenticatedUser(
          supabaseUserId: 'supabase-user',
          ezygoToken: EncryptedValue.fromPlaintext('ezygo-token'),
          settings: UserSettings.defaults(),
          profile: const UserProfile(firstName: 'Test'),
        ),
      );

      when(
        () => mockStorage.getAcademicState(),
      ).thenAnswer((_) async => null);
      when(
        () => mockStorage.saveAcademicState(any()),
      ).thenAnswer((_) async {});
      when(
        () => mockApi.updateSemester(any(), mockStorage),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/semester'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );
      when(
        () => mockApi.updateAcademicYear(any(), mockStorage),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/year'),
          statusCode: 200,
          data: {'ok': true},
        ),
      );
      when(
        () => mockApi.refreshProfile(
          any(),
          sync: any(named: 'sync'),
          force: any(named: 'force'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/profile'),
          statusCode: 401,
          data: {
            'type': 'security',
            'criticalRisk': false,
            'reason': 'Temporarily blocked',
          },
        ),
      );

      await expectLater(
        () => notifier.updateAcademicContext('Even', '2025-2026'),
        throwsA(isA<AppException>()),
      );

      verifyNever(() => mockAuth.signOut());
      verifyNever(() => mockStorage.clearAll());
    },
  );

  test('updateAcademicContext logs out for critical security 401', () async {
    await initAnalytics();

    final container = buildContainer();
    addTearDown(container.dispose);
    final notifier = container.read(authProvider.notifier);
    currentSession = mockSession;

    notifier.state = AsyncValue.data(
      AuthenticatedUser(
        supabaseUserId: 'supabase-user',
        ezygoToken: EncryptedValue.fromPlaintext('ezygo-token'),
        settings: UserSettings.defaults(),
        profile: const UserProfile(firstName: 'Test'),
      ),
    );

    when(
      () => mockStorage.getAcademicState(),
    ).thenAnswer((_) async => null);
    when(
      () => mockStorage.saveAcademicState(any()),
    ).thenAnswer((_) async {});
    when(
      () => mockApi.updateSemester(any(), mockStorage),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(path: '/semester'),
        statusCode: 200,
        data: {'ok': true},
      ),
    );
    when(
      () => mockApi.updateAcademicYear(any(), mockStorage),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(path: '/year'),
        statusCode: 200,
        data: {'ok': true},
      ),
    );
    when(
      () => mockApi.refreshProfile(
        any(),
        sync: any(named: 'sync'),
        force: any(named: 'force'),
      ),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(path: '/profile'),
        statusCode: 401,
        data: {
          'type': 'security',
          'criticalRisk': true,
          'reason': 'Critical security risk',
        },
      ),
    );

    await expectLater(
      () => notifier.updateAcademicContext('Even', '2025-2026'),
      throwsA(isA<AppException>()),
    );

    verify(() => mockAuth.signOut()).called(1);
    verify(() => mockStorage.clearAll()).called(1);
  });
}
