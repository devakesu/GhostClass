import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/screens/navigation_shell.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';

import 'coverage_helper.dart';

void main() {
  setUp(TestWidgetsFlutterBinding.ensureInitialized);

  test('GoRouterRefreshStream notifies on stream events', () async {
    final controller = StreamController<int>();
    final stream = controller.stream;

    final refresh = GoRouterRefreshStream(stream);

    var notified = 0;
    refresh.addListener(() => notified++);

    // constructor calls notifyListeners immediately, but listener was added after construction
    // so start at 0 then emit one event to verify notifications work.
    expect(notified, equals(0));

    controller.add(1);
    // allow event loop to process
    await Future<void>.delayed(const Duration(milliseconds: 10));

    expect(notified, greaterThanOrEqualTo(1));

    refresh.dispose();
    await controller.close();
  });

  testWidgets('NavigationShell renders inside a GoRouter ShellRoute', (
    tester,
  ) async {
    // Common mock overrides (reuse helpers)
    final mockDashboard = createMockDashboardData();
    final mockUser = createMockUser();
    final mockTracking = TrackingState(
      groupedByCourse: {'TEST101': []},
      totalCount: 0,
      isSyncing: false,
      syncCompleted: true,
    );
    const mockAcademic = AcademicState(year: '2025', semester: '1');
    const mockNotifications = NotificationsState(
      actionNotifications: [],
      regularNotifications: [],
      unreadCount: 2,
    );

    final overrides = [
      dashboardProvider.overrideWith(
        () => MockDashboardNotifier(mockDashboard),
      ),
      authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
      trackingProvider.overrideWith(() => MockTrackingNotifier(mockTracking)),
      academicProvider.overrideWith(() => MockAcademicNotifier(mockAcademic)),
      notificationsProvider.overrideWith(
        () => MockNotificationNotifier(mockNotifications),
      ),
      outageProvider.overrideWith(() => MockOutageNotifier(data: false)),
      securityFailureProvider.overrideWith(
        () => MockSecurityFailureNotifier(null),
      ),
    ];

    final goRouter = GoRouter(
      initialLocation: '/dashboard',
      routes: [
        ShellRoute(
          builder: (context, state, child) => NavigationShell(child: child),
          routes: [
            GoRoute(
              path: '/dashboard',
              builder: (context, state) =>
                  const Scaffold(body: Center(child: Text('dashboard'))),
            ),
          ],
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp.router(
          routerConfig: goRouter,
          theme: AppTheme.darkTheme,
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Expect dashboard route content and that NavigationShell exists
    expect(find.text('dashboard'), findsOneWidget);
    expect(find.byType(NavigationShell), findsOneWidget);
  });
}
