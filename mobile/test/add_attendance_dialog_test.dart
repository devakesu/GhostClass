import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/add_attendance_dialog.dart';
import 'package:intl/intl.dart';

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

  testWidgets(
    'AddAttendanceDialog shows blocked state when session is occupied',
    (tester) async {
      final mockData = createMockDashboardData();
      final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final occupiedDashboard = DashboardData(
        courses: mockData.courses,
        attendance: mockData.attendance,
        tracking: [
          TrackingRecord(
            id: 1,
            date: todayStr,
            session: 'I',
            status: 'extra',
            attendance: 'P',
            course: 'TEST101',
          ),
        ],
        stats: mockData.stats,
        selectedSemester: mockData.selectedSemester,
        selectedYear: mockData.selectedYear,
      );

      final overrides = [
        dashboardProvider.overrideWith(
          () => MockDashboardNotifier(occupiedDashboard),
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

      // Session 1 ('1st Hour') is occupied. Tap on '1st Hour' to select it.
      await tester.tap(find.text('1st Hour'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Session occupied'), findsNWidgets(2));
      expect(find.text('Please select another period/hour'), findsOneWidget);
    },
  );
}
