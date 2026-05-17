import 'dart:async';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/screens/login_screen.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

class FakeLoginAuthNotifier extends AuthNotifier {
  FakeLoginAuthNotifier(this.onLogin);

  final Future<void> Function(String username, String password) onLogin;

  @override
  FutureOr<AuthenticatedUser?> build() async => null;

  @override
  Future<void> login(String username, String password) => onLogin(
    username,
    password,
  );
}

class FakeAppUpdateNotifier extends AppUpdateNotifier {
  @override
  AppUpdateState build() {
    return AppUpdateState(
      checkResult: AppVersionCheckResult(
        latestVersion: '3.1.0',
        minVersion: '3.0.8',
        hasUpdate: true,
        isForceUpdate: false,
      ),
    );
  }
}

void main() {
  late MockFirebaseAnalytics mockAnalytics;

  setUp(() {
    mockAnalytics = MockFirebaseAnalytics();
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
  });

  testWidgets('logs login attempt and failure analytics', (tester) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final fakeNotifier = FakeLoginAuthNotifier((username, password) async {
      throw LoginException('Invalid credentials');
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => fakeNotifier)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byType(TextFormField).at(0), 'student');
    await tester.enterText(find.byType(TextFormField).at(1), 'password');
    await tester.tap(find.text('Login'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    final loginAttemptVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'login_attempt',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final loginAttemptParams =
        loginAttemptVerification.captured.single as Map<String, Object?>;
    expect(loginAttemptParams['username_length'], 'student'.length);
    expect(loginAttemptParams['env'], anyOf('development', 'production'));

    final loginFailedVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'login_failed',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final loginFailedParams =
        loginFailedVerification.captured.single as Map<String, Object?>;
    expect(loginFailedParams['reason'], 'Invalid credentials');
    expect(loginFailedParams['env'], anyOf('development', 'production'));
  });

  testWidgets('logs successful login', (tester) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final fakeNotifier = FakeLoginAuthNotifier((username, password) async {
      // Simulate successful login
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => fakeNotifier)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byType(TextFormField).at(0), 'student');
    await tester.enterText(find.byType(TextFormField).at(1), 'password');
    await tester.tap(find.text('Login'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    final loginAttemptVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'login_attempt',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final loginAttemptParams =
        loginAttemptVerification.captured.single as Map<String, Object?>;
    expect(loginAttemptParams['username_length'], 'student'.length);
  });

  testWidgets('handles long username in login attempt', (tester) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final longUsername = 'a' * 100;
    final fakeNotifier = FakeLoginAuthNotifier((username, password) async {
      throw LoginException('Invalid credentials');
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => fakeNotifier)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byType(TextFormField).at(0), longUsername);
    await tester.enterText(find.byType(TextFormField).at(1), 'password');
    await tester.tap(find.text('Login'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    final loginAttemptVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'login_attempt',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final loginAttemptParams =
        loginAttemptVerification.captured.single as Map<String, Object?>;
    expect(loginAttemptParams['username_length'], 100);
  });

  testWidgets('displays optional update dialog when mounted', (tester) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final fakeNotifier = FakeLoginAuthNotifier((username, password) async {});

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => fakeNotifier),
          appUpdateProvider.overrideWith(FakeAppUpdateNotifier.new),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    expect(find.text('New Update Available!'), findsOneWidget);
  });
}
