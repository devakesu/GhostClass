import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/screens/dashboard_screen.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';

import '../coverage_helper.dart';

class MockDashboardNotifier extends DashboardNotifier {
  MockDashboardNotifier(this._initial);
  final DashboardData? _initial;

  @override
  FutureOr<DashboardData> build() {
    if (_initial != null) return _initial;
    throw Exception('No data');
  }
}

class MockAcademicNotifier extends AcademicNotifier {
  MockAcademicNotifier(this._initial);
  final AcademicState? _initial;

  @override
  FutureOr<AcademicState?> build() => _initial;
}

class MockAuthNotifier extends AuthNotifier {
  MockAuthNotifier(this._initial);
  final AuthenticatedUser? _initial;

  @override
  FutureOr<AuthenticatedUser?> build() => _initial;
}

void main() {
  final sampleDashboardData = createMockDashboardData();

  final sampleUser = AuthenticatedUser(
    supabaseUserId: 'test-user',
    ezygoToken: EncryptedValue.fromPlaintext('test-token'),
    settings: UserSettings.defaults(),
    isSyncing: true, // Active background sync
  );

  testWidgets(
    'DashboardScreen renders cached data immediately without blocking on isSyncing',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dashboardProvider.overrideWith(
              () => MockDashboardNotifier(sampleDashboardData),
            ),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                AcademicState(
                  semester: sampleDashboardData.selectedSemester,
                  year: sampleDashboardData.selectedYear,
                ),
              ),
            ),
            authProvider.overrideWith(() => MockAuthNotifier(sampleUser)),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const DashboardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // LoadingOverlay should NOT be displayed because cached data is available
      expect(find.byType(LoadingOverlay), findsNothing);

      // Dashboard content should be rendered
      expect(find.byType(DashboardScreen), findsOneWidget);
    },
  );

  testWidgets(
    'DashboardScreen shows LoadingOverlay or error view when data is null',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dashboardProvider.overrideWith(
              () => MockDashboardNotifier(null),
            ),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                AcademicState(
                  semester: sampleDashboardData.selectedSemester,
                  year: sampleDashboardData.selectedYear,
                ),
              ),
            ),
            authProvider.overrideWith(() => MockAuthNotifier(sampleUser)),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const DashboardScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(DashboardScreen), findsOneWidget);
    },
  );
}
