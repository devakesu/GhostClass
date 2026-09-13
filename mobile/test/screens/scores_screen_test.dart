import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/screens/scores_screen.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';

import '../coverage_helper.dart';

void main() {
  testWidgets(
    'ScoresScreen shows LoadingOverlay while initial data is loading',
    (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(createMockUser())),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                const AcademicState(semester: 'odd', year: '2024-25'),
              ),
            ),
            scoreProvider.overrideWith(_LoadingScoreNotifier.new),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const ScoresScreen(),
          ),
        ),
      );

      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(LoadingOverlay), findsOneWidget);
      expect(
        find.text('Waiting on Ezygo to stop ghosting us 👻'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'ScoresScreen shows ServiceErrorView when scoreProvider has error',
    (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(createMockUser())),
            academicProvider.overrideWith(
              () => MockAcademicNotifier(
                const AcademicState(semester: 'odd', year: '2024-25'),
              ),
            ),
            scoreProvider.overrideWith(_ErrorScoreNotifier.new),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const ScoresScreen(),
          ),
        ),
      );

      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(ServiceErrorView), findsOneWidget);
    },
  );

  testWidgets('ScoresScreen shows content when scoreProvider has data', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(() => MockAuthNotifier(createMockUser())),
          academicProvider.overrideWith(
            () => MockAcademicNotifier(
              const AcademicState(semester: 'odd', year: '2024-25'),
            ),
          ),
          scoreProvider.overrideWith(
            () => MockScoreNotifier(createMockScoreState()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const ScoresScreen(),
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Internal Marks'), findsOneWidget);
    expect(find.text('TOTAL'), findsOneWidget);
    expect(find.text('SCORED'), findsOneWidget);
    expect(find.text('PENDING'), findsOneWidget);
  });
}

class _LoadingScoreNotifier extends ScoreNotifier {
  @override
  Future<ScoreState> build() async {
    state = const AsyncValue.loading();
    // Complete with completer that never finishes in test
    final completer = Completer<ScoreState>();
    return completer.future;
  }
}

class _ErrorScoreNotifier extends ScoreNotifier {
  @override
  Future<ScoreState> build() async {
    throw Exception('Failed to load scores');
  }
}
