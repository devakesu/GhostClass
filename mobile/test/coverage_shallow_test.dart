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
import 'package:ghostclass/screens/splash_screen.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/add_attendance_dialog.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';
import 'package:ghostclass/widgets/tracking/tracking_subject_picker.dart';

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

  setUp(TestWidgetsFlutterBinding.ensureInitialized);

  testWidgets('Shallow render important widgets', (tester) async {
    tester.view.physicalSize = const Size(800, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    // Common ProviderScope overrides
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

    // Basic root app to ensure bindings
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 360,
                height: 640,
                child: Builder(builder: (ctx) => const Text('root')),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    // AddAttendanceDialog inside a constrained, wide box to avoid overflow
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const Scaffold(
            body: Center(
              child: SizedBox(
                width: 800,
                height: 480,
                child: AddAttendanceDialog(),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    // LoadingOverlay and ServiceErrorDialog with app theme
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const Scaffold(
            body: Center(
              child: SizedBox(
                width: 360,
                height: 260,
                child: LoadingOverlay(message: 'Hi', isFullScreen: false),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Center(
          child: SizedBox(
            width: 360,
            height: 200,
            child: ServiceErrorDialog(
              title: 'Err',
              messages: const ['M'],
              onRetry: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    // TrackingSubjectPicker
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: Scaffold(
            body: Center(
              child: TrackingSubjectPicker(
                selectedCourse: 'all',
                courseKeys: const ['TEST101'],
                groupedByCourse: const {'TEST101': []},
                onSelected: (_) {},
                allCourses: const [],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // SplashScreen (wrapped in ProviderScope)
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: const MaterialApp(home: SplashScreen()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
  });
}
