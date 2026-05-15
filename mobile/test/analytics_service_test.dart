import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

void main() {
  late MockFirebaseAnalytics mockAnalytics;

  setUpAll(() {
    registerFallbackValue(<String, Object?>{});
  });

  setUp(() {
    AnalyticsService.resetForTest();
    mockAnalytics = MockFirebaseAnalytics();
  });

  Future<void> initService() async {
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
      () => mockAnalytics.logScreenView(
        screenName: any(named: 'screenName'),
        screenClass: any(named: 'screenClass'),
        parameters: any(named: 'parameters'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => mockAnalytics.logEvent(
        name: any(named: 'name'),
        parameters: any(named: 'parameters'),
      ),
    ).thenAnswer((_) async {});

    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);
  }

  test('initialize sets env user property and logs app_open', () async {
    await initService();

    final userPropertyVerification = verify(
      () => mockAnalytics.setUserProperty(
        name: 'env',
        value: captureAny(named: 'value'),
      ),
    );
    expect(userPropertyVerification.captured.single, isA<String>());

    final appOpenVerification = verify(
      () =>
          mockAnalytics.logAppOpen(parameters: captureAny(named: 'parameters')),
    );
    final appOpenParams =
        appOpenVerification.captured.single as Map<String, Object?>;
    expect(appOpenParams['env'], anyOf('development', 'production'));
  });

  test('login and logout events include env tagging', () async {
    await initService();

    await AnalyticsService.instance.logLogin(method: 'ezygo');
    await AnalyticsService.instance.logLogout();

    final loginVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'login',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final loginParams =
        loginVerification.captured.single as Map<String, Object?>;
    expect(loginParams['method'], 'ezygo');
    expect(loginParams['env'], anyOf('development', 'production'));

    final logoutVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'logout',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final logoutParams =
        logoutVerification.captured.single as Map<String, Object?>;
    expect(logoutParams['env'], anyOf('development', 'production'));
  });

  test('attendance, settings, terms, and custom events keep env tag', () async {
    await initService();

    await AnalyticsService.instance.logAttendanceMarked(
      courseId: '42',
      count: 2,
    );
    await AnalyticsService.instance.logAttendanceDeleted(
      courseId: '42',
      count: 1,
    );
    await AnalyticsService.instance.logSettingsUpdated({
      'bunkCalculatorEnabled': true,
    });
    await AnalyticsService.instance.logAcceptTerms('v1');
    await AnalyticsService.instance.logCustom('my_event', {'foo': 'bar'});

    final attendanceVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'attendance_marked',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final attendanceParams =
        attendanceVerification.captured.single as Map<String, Object?>;
    expect(attendanceParams['course_id'], '42');
    expect(attendanceParams['env'], anyOf('development', 'production'));

    final deletedVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'attendance_deleted',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final deletedParams =
        deletedVerification.captured.single as Map<String, Object?>;
    expect(deletedParams['count'], 1);
    expect(deletedParams['env'], anyOf('development', 'production'));

    final settingsVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'settings_updated',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final settingsParams =
        settingsVerification.captured.single as Map<String, Object?>;
    expect(settingsParams['bunkCalculatorEnabled'], true);
    expect(settingsParams['env'], anyOf('development', 'production'));

    final termsVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'accept_terms',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final termsParams =
        termsVerification.captured.single as Map<String, Object?>;
    expect(termsParams['version'], 'v1');
    expect(termsParams['env'], anyOf('development', 'production'));

    final customVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'my_event',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final customParams =
        customVerification.captured.single as Map<String, Object?>;
    expect(customParams['foo'], 'bar');
    expect(customParams['env'], anyOf('development', 'production'));
  });

  test('handles Firebase exceptions gracefully in all methods', () async {
    await initService();

    // Mock all methods to throw exceptions
    when(
      () => mockAnalytics.setUserProperty(
        name: any(named: 'name'),
        value: any(named: 'value'),
      ),
    ).thenThrow(Exception('Firebase error'));

    when(
      () => mockAnalytics.logScreenView(
        screenName: any(named: 'screenName'),
        screenClass: any(named: 'screenClass'),
        parameters: any(named: 'parameters'),
      ),
    ).thenThrow(Exception('Firebase error'));

    when(
      () => mockAnalytics.logEvent(
        name: any(named: 'name'),
        parameters: any(named: 'parameters'),
      ),
    ).thenThrow(Exception('Firebase error'));

    when(
      () => mockAnalytics.logAppOpen(parameters: any(named: 'parameters')),
    ).thenThrow(Exception('Firebase error'));

    // These should not throw, exceptions should be caught
    await expectLater(
      AnalyticsService.instance.logScreenView('test_screen'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logLogin(method: 'test'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logLogout(),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logSignUp(method: 'test'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logAttendanceMarked(courseId: '1', count: 1),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logLeaveRequested(courseId: '1', type: 'test'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logError('test error', stack: 'trace'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logAttendanceDeleted(courseId: '1', count: 1),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logSettingsUpdated({'key': 'value'}),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logAcceptTerms('v1'),
      completes,
    );
    await expectLater(
      AnalyticsService.instance.logCustom('test', {'key': 'value'}),
      completes,
    );
  });

  test('getObserver returns FirebaseAnalyticsObserver instance', () async {
    await initService();
    final observer = AnalyticsService.instance.observer;
    expect(observer, isA<FirebaseAnalyticsObserver>());
  });

  test('resetForTest clears analytics instance', () {
    AnalyticsService.resetForTest();
    // Verify that accessing analytics after reset throws
    expect(
      () => AnalyticsService.instance.analytics,
      throwsA(isA<StateError>()),
    );
  });
}
