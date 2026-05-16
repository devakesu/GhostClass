import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/screens/ghostclass_screen.dart';
import 'package:ghostclass/screens/profile_dump_screen.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/dashboard/disable_aware_course_card.dart';

import 'coverage_helper.dart';

void main() {
  test('GoRouterRefreshStream notifies on stream events', () async {
    final controller = StreamController<void>();
    final stream = controller.stream;
    final refresh = GoRouterRefreshStream(stream);

    var called = 0;
    refresh.addListener(() => called++);

    controller.add(null);
    // allow microtask
    await Future<void>.delayed(Duration.zero);
    expect(called, greaterThanOrEqualTo(1));

    refresh.dispose();
    await controller.close();
  });

  testWidgets('ProfileDumpScreen shows Raw Data for mocked user', (
    tester,
  ) async {
    final mockUser = createMockUser();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          institutionsProvider.overrideWith(
            (ref) => Future.value([
              const Institution(id: 1, name: 'Test Univ', role: 'institution'),
            ]),
          ),
          academicProvider.overrideWith(
            () => MockAcademicNotifier(
              const AcademicState(semester: '1', year: '2025'),
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const ProfileDumpScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Raw Data'), findsOneWidget);
    expect(find.textContaining('Supabase UUID'), findsOneWidget);
  });

  testWidgets('DisableDialogContent other reason flow calls onDisable', (
    tester,
  ) async {
    var called = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => DisableDialogContent(
                      courseCode: 'CS101',
                      semesterKey: '2025-1',
                      reasons: const ['Other', 'Dropped course'],
                      onDisable: (reason) async {
                        called = true;
                      },
                    ),
                  ),
                  child: const Text('Open'),
                ),
              ),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    // 'Other' is pre-selected; enter custom reason
    expect(find.byType(TextField), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'My reason');
    await tester.pumpAndSettle();

    // DISABLE button should be enabled
    expect(find.widgetWithText(ElevatedButton, 'DISABLE'), findsOneWidget);
    await tester.tap(find.widgetWithText(ElevatedButton, 'DISABLE'));
    await tester.pumpAndSettle();

    // Advance timers for ServiceToast duration to avoid pending timers
    await tester.pump(const Duration(seconds: 4));

    expect(called, isTrue);
  });

  testWidgets('GhostClassScreen renders APP SETTINGS for mocked user', (
    tester,
  ) async {
    final mockUser = createMockUser();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => MockAuthNotifier(mockUser)),
          institutionsProvider.overrideWith(
            (ref) => Future.value([
              const Institution(id: 1, name: 'Test Univ', role: 'institution'),
            ]),
          ),
          academicProvider.overrideWith(
            () => MockAcademicNotifier(
              const AcademicState(semester: '1', year: '2025'),
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const GhostClassScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('APP SETTINGS'), findsOneWidget);
    expect(find.textContaining('Target'), findsOneWidget);
  });
}
