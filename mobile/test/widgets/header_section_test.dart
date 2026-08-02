import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/widgets/dashboard/header_section.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../coverage_helper.dart';

void main() {
  testWidgets('HeaderSection - allow next when under limit', (tester) async {
    final mockUser = createMockUser();
    final mockDashboard = DashboardData(
      courses: const [],
      attendance: const AttendanceReportDetailed(
        studentAttendanceData: <String, Map<String, AttendanceSession>>{},
        courses: <String, AttendanceCourse>{},
        attendanceDates: <String, dynamic>{},
      ),
      tracking: const [],
      stats: DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          studentAttendanceData: <String, Map<String, AttendanceSession>>{},
          courses: <String, AttendanceCourse>{},
          attendanceDates: <String, dynamic>{},
        ),
        trackingRecords: const <TrackingRecord>[],
        selectedSemester: 'odd',
        selectedYear: '2025-26',
      ),
      selectedSemester: 'odd',
      selectedYear: '2025-26',
    );
    const mockAcademic = AcademicState(semester: 'odd', year: '2025-26');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          academicProvider.overrideWith(
            () => MockAcademicNotifier(mockAcademic),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: CustomScrollView(
              slivers: [
                HeaderSection(data: mockDashboard),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();
    final nextBtn = find.byIcon(LucideIcons.chevronRight);
    expect(nextBtn, findsOneWidget);

    await tester.tap(nextBtn);
    await tester.pumpAndSettle();

    expect(find.text('Confirm academic period change'), findsOneWidget);
  });

  testWidgets('HeaderSection - toast when next is over limit', (tester) async {
    final mockUser = createMockUser();
    final mockDashboard = DashboardData(
      courses: const [],
      attendance: const AttendanceReportDetailed(
        studentAttendanceData: <String, Map<String, AttendanceSession>>{},
        courses: <String, AttendanceCourse>{},
        attendanceDates: <String, dynamic>{},
      ),
      tracking: const [],
      stats: DashboardStats.calculate(
        attendanceData: const AttendanceReportDetailed(
          studentAttendanceData: <String, Map<String, AttendanceSession>>{},
          courses: <String, AttendanceCourse>{},
          attendanceDates: <String, dynamic>{},
        ),
        trackingRecords: const <TrackingRecord>[],
        selectedSemester: 'odd',
        selectedYear: '2027-28',
      ),
      selectedSemester: 'odd',
      selectedYear: '2027-28',
    );
    const mockAcademic = AcademicState(semester: 'odd', year: '2027-28');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          academicProvider.overrideWith(
            () => MockAcademicNotifier(mockAcademic),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: CustomScrollView(
              slivers: [
                HeaderSection(data: mockDashboard),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    final nextBtn = find.byIcon(LucideIcons.chevronRight);
    expect(nextBtn, findsOneWidget);

    await tester.tap(nextBtn);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text('You cannot view past the maximum allowed academic period'),
      findsOneWidget,
    );
    // Allow the auto-dismiss timer of ServiceToast to complete to avoid pending timer error
    await tester.pumpAndSettle(const Duration(seconds: 4));
  });
}
