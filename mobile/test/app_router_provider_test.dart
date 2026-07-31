import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'coverage_helper.dart';

class _MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

void main() {
  test('routerProvider instantiates without throwing', () async {
    SharedPreferences.setMockInitialValues({});
    // initialize analytics service with a mock to satisfy routerProvider
    AnalyticsService.resetForTest();
    final mockAnalytics = _MockFirebaseAnalytics();
    registerFallbackValue(<String, Object?>{});
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

    await Supabase.initialize(
      url: 'https://example.com',
      publishableKey: 'anon',
    );

    final container = ProviderContainer(
      overrides: [
        authProvider.overrideWith(() => MockAuthNotifier(null)),
      ],
    );

    // Reading routerProvider should construct the GoRouter and related listeners
    final router = container.read(routerProvider);
    expect(router, isNotNull);

    container.dispose();
  });
}
