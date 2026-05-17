import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/screens/navigation_shell.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';

import 'coverage_helper.dart';

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
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('NavigationShell shows outage barrier when outageProvider true', (
    tester,
  ) async {
    final mockDashboard = createMockDashboardData();
    final mockUser = createMockUser();
    final mockTracking = TrackingState(
      groupedByCourse: {'TEST101': []},
      totalCount: 0,
      isSyncing: false,
      syncCompleted: true,
    );

    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) =>
              const NavigationShell(child: Center(child: Text('child'))),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dashboardProvider.overrideWith(
            () => MockDashboardNotifier(mockDashboard),
          ),
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          trackingProvider.overrideWith(
            () => MockTrackingNotifier(mockTracking),
          ),
          outageProvider.overrideWith(() => MockOutageNotifier(data: true)),
        ],
        child: MaterialApp.router(
          theme: AppTheme.darkTheme,
          routerConfig: router,
        ),
      ),
    );

    await tester.pumpAndSettle();

    // ServiceErrorView should appear when outageProvider is true
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets(
    'NavigationShell shows security barrier when securityFailure present',
    (tester) async {
      final mockDashboard = createMockDashboardData();
      final mockUser = createMockUser();
      final mockTracking = TrackingState(
        groupedByCourse: {'TEST101': []},
        totalCount: 0,
        isSyncing: false,
        syncCompleted: true,
      );

      final router2 = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const NavigationShell(child: Center(child: Text('child'))),
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dashboardProvider.overrideWith(
              () => MockDashboardNotifier(mockDashboard),
            ),
            authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
            trackingProvider.overrideWith(
              () => MockTrackingNotifier(mockTracking),
            ),
            securityFailureProvider.overrideWith(
              () => MockSecurityFailureNotifier(
                const SecurityFailureState(message: 'Bad'),
              ),
            ),
          ],
          child: MaterialApp.router(
            theme: AppTheme.darkTheme,
            routerConfig: router2,
          ),
        ),
      );

      // Use a fixed pump duration to avoid waiting forever on repeating animations
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Security Verification Failed'), findsOneWidget);
    },
  );

  testWidgets('NavigationShell shows optional update dialog on mount', (
    tester,
  ) async {
    final mockDashboard = createMockDashboardData();
    final mockUser = createMockUser();
    final mockTracking = TrackingState(
      groupedByCourse: {'TEST101': []},
      totalCount: 0,
      isSyncing: false,
      syncCompleted: true,
    );

    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) =>
              const NavigationShell(child: Center(child: Text('child'))),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dashboardProvider.overrideWith(
            () => MockDashboardNotifier(mockDashboard),
          ),
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          trackingProvider.overrideWith(
            () => MockTrackingNotifier(mockTracking),
          ),
          appUpdateProvider.overrideWith(FakeAppUpdateNotifier.new),
        ],
        child: MaterialApp.router(
          theme: AppTheme.darkTheme,
          routerConfig: router,
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    expect(find.text('New Update Available!'), findsOneWidget);
    // Tap the Later button to cover the dismiss state callback
    await tester.tap(find.text('Later'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
  });
}
