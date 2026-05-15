import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

class _ErrorHarness extends StatefulWidget {
  const _ErrorHarness({required this.error});

  final Object error;

  @override
  State<_ErrorHarness> createState() => _ErrorHarnessState();
}

class _ErrorHarnessState extends State<_ErrorHarness>
    with ErrorHandlerMixin<_ErrorHarness> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ElevatedButton(
          onPressed: () => handleError(
            widget.error,
            title: 'Test Error',
            errorContext: 'testing',
          ),
          child: const Text('Trigger'),
        ),
      ),
    );
  }
}

void main() {
  late MockFirebaseAnalytics mockAnalytics;

  setUp(() {
    AnalyticsService.resetForTest();
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
  });

  testWidgets('logs app_error for standard errors', (tester) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    await tester.pumpWidget(
      const MaterialApp(home: _ErrorHarness(error: 'boom')),
    );

    await tester.tap(find.text('Trigger'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    final verification = verify(
      () => mockAnalytics.logEvent(
        name: 'app_error',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final params = verification.captured.single as Map<String, Object?>;
    expect(params['message'], contains('boom'));
    expect(params['env'], anyOf('development', 'production'));
  });

  testWidgets('logs security_failure for security AppExceptions', (
    tester,
  ) async {
    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    await tester.pumpWidget(
      const MaterialApp(
        home: _ErrorHarness(
          error: AppException(
            message: 'Security blocked',
            type: AppExceptionType.forbidden,
            details: {
              'type': 'security',
              'reason': 'Integrity check failed',
              'action': 'Restart the app',
              'criticalRisk': true,
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Trigger'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    final verification = verify(
      () => mockAnalytics.logEvent(
        name: 'security_failure',
        parameters: captureAny(named: 'parameters'),
      ),
    );
    final params = verification.captured.single as Map<String, Object?>;
    expect(params['reason'], 'Integrity check failed');
    expect(params['critical'], true);
    expect(params['env'], anyOf('development', 'production'));
  });
}
