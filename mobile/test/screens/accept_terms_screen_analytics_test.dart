import 'dart:async';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/screens/accept_terms_screen.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

class _FakeAcceptTermsNotifier extends AuthNotifier {
  _FakeAcceptTermsNotifier(this.user);

  final AuthenticatedUser user;
  bool accepted = false;

  @override
  FutureOr<AuthenticatedUser?> build() async => user;

  @override
  Future<void> acceptTerms() async {
    accepted = true;
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

  testWidgets('logs accept-terms screen view and tap analytics', (
    tester,
  ) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final fakeNotifier = _FakeAcceptTermsNotifier(
      AuthenticatedUser(
        supabaseUserId: 'user-1',
        ezygoToken: EncryptedValue.fromPlaintext('token'),
        settings: UserSettings.defaults(),
        termsVersion: 'old-version',
        profile: const UserProfile(firstName: 'Test'),
      ),
    );

    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const AcceptTermsScreen(),
        ),
        GoRoute(
          path: '/dashboard',
          builder: (context, state) => const Scaffold(body: Text('Dashboard')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authProvider.overrideWith(() => fakeNotifier)],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome!'), findsOneWidget);

    await tester.tap(
      find.text(
        'I have read and accept the above Disclaimer and all Policies.',
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Enter GhostClass'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    verify(
      () => mockAnalytics.logScreenView(
        screenName: 'accept_terms',
        screenClass: any(named: 'screenClass'),
        parameters: any(named: 'parameters'),
      ),
    );

    final tapVerification = verify(
      () => mockAnalytics.logEvent(
        name: 'accept_terms_tap',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final tapParams = tapVerification.captured.single as Map<String, Object?>;
    expect(tapParams['version'], AppConfig.termsVersion);
    expect(tapParams['env'], anyOf('development', 'production'));
    expect(fakeNotifier.accepted, isTrue);
  });
}
