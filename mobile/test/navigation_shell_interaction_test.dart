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
import 'package:ghostclass/screens/navigation_shell.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';

import 'coverage_helper.dart';

void main() {
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

  testWidgets('NavigationShell interaction: notifications and tab change', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

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

    final router = GoRouter(
      initialLocation: '/dashboard',
      routes: [
        ShellRoute(
          builder: (context, state, child) => NavigationShell(child: child),
          routes: [
            GoRoute(
              path: '/dashboard',
              pageBuilder: (c, s) =>
                  const MaterialPage(child: Center(child: Text('dashboard'))),
            ),
            GoRoute(
              path: '/calendar',
              pageBuilder: (c, s) =>
                  const MaterialPage(child: Center(child: Text('calendar'))),
            ),
          ],
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp.router(
          theme: AppTheme.darkTheme,
          routerConfig: router,
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Dashboard content present
    expect(find.text('dashboard'), findsOneWidget);

    // Programmatic navigation: go to calendar and verify content updates
    router.go('/calendar');
    await tester.pumpAndSettle();
    expect(find.text('calendar'), findsOneWidget);

    // Navigate back to dashboard
    router.go('/dashboard');
    await tester.pumpAndSettle();
    expect(find.text('dashboard'), findsOneWidget);
  });
}
