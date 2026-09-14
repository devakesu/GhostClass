import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

void main() {
  testWidgets('ServiceErrorView renders default elements properly', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: ServiceErrorView(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Connection Error'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byIcon(LucideIcons.refreshCcw), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Contact Us'), findsOneWidget);
  });

  testWidgets(
    'ServiceErrorView Retry button executes onRetry and handles success',
    (tester) async {
      var retryCalled = false;
      final completer = Completer<void>();

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: ServiceErrorView(
                onRetry: () async {
                  retryCalled = true;
                  await completer.future;
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Retry
      await tester.tap(find.text('Retry'));
      await tester.pump();

      // Spinner and "Retrying..." should be shown while in flight
      expect(retryCalled, isTrue);
      expect(find.text('Retrying...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Complete retry
      completer.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Should return to "Retry" and show success toast
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('Connected successfully!'), findsOneWidget);

      // Allow toast auto-dismiss timer to settle
      await tester.pumpAndSettle(const Duration(seconds: 4));
    },
  );

  testWidgets(
    'ServiceErrorView Retry button catches errors and shows tactile failure indicator',
    (tester) async {
      var retryCalled = false;
      final completer = Completer<void>();

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: ServiceErrorView(
                onRetry: () async {
                  retryCalled = true;
                  await completer.future;
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Retry
      await tester.tap(find.text('Retry'));
      await tester.pump();

      expect(retryCalled, isTrue);
      expect(find.text('Retrying...'), findsOneWidget);

      // Complete with failure error
      completer.completeError(Exception('Network offline'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Button must return to "Retry"
      expect(find.text('Retry'), findsOneWidget);

      // Failure toast must be visible
      expect(
        find.text('Connection failed. Please check your network and try again.'),
        findsOneWidget,
      );

      // Visual failure tag must be visible
      expect(
        find.text('Retry failed just now. Still unable to reach server.'),
        findsOneWidget,
      );

      // Allow toast auto-dismiss timer to settle
      await tester.pumpAndSettle(const Duration(seconds: 4));
    },
  );
}
