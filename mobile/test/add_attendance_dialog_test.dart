import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/add_attendance_dialog.dart';

import 'coverage_helper.dart';

void main() {
  testWidgets('AddAttendanceDialog renders and interacts', (tester) async {
    final mockDashboard = createMockDashboardData();

    final overrides = [
      dashboardProvider.overrideWith(
        () => MockDashboardNotifier(mockDashboard),
      ),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: Scaffold(
            body: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: const AddAttendanceDialog(),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Add Extra Class'), findsOneWidget);
    expect(find.text('Add Record'), findsOneWidget);
  });
}
