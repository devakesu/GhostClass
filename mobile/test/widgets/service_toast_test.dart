import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

void main() {
  testWidgets('ServiceToast.show displays message and handles dismissal', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () {
                  ServiceToast.show(
                    context,
                    'Operation successful',
                    duration: const Duration(milliseconds: 500),
                  );
                },
                child: const Text('Show Success Toast'),
              ),
            ),
          ),
        ),
      ),
    );

    // Click to show success toast
    await tester.tap(find.text('Show Success Toast'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Assert success toast renders with check circle icon and correct text
    expect(find.text('Operation successful'), findsOneWidget);
    expect(find.byIcon(LucideIcons.checkCircle2), findsOneWidget);

    // Let the toast dismiss itself
    await tester.pumpAndSettle(const Duration(milliseconds: 600));

    // Toast should be gone
    expect(find.text('Operation successful'), findsNothing);
  });

  testWidgets('ServiceToast.show exhibits error styling when isError is true', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () {
                  ServiceToast.show(
                    context,
                    'Something went wrong',
                    isError: true,
                    duration: const Duration(milliseconds: 500),
                  );
                },
                child: const Text('Show Error Toast'),
              ),
            ),
          ),
        ),
      ),
    );

    // Click to show error toast
    await tester.tap(find.text('Show Error Toast'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Assert error toast renders with alert circle icon
    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.byIcon(LucideIcons.alertCircle), findsOneWidget);

    // Let it dismiss itself
    await tester.pumpAndSettle(const Duration(milliseconds: 600));
  });

  testWidgets(
    'ServiceToast.showNotification displays custom visual glassmorphic banner',
    (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: ThemeMode.light,
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () {
                    ServiceToast.showNotification(
                      context,
                      title: 'New Class Assigned',
                      body: 'Prof. Davis assigned you to Algorithms.',
                      onTap: () {
                        tapped = true;
                      },
                      duration: const Duration(seconds: 1),
                    );
                  },
                  child: const Text('Show Notification Banner'),
                ),
              ),
            ),
          ),
        ),
      );

      // Tap button to invoke notification banner
      await tester.tap(find.text('Show Notification Banner'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify title, body, and all visual icons are present
      expect(find.text('New Class Assigned'), findsOneWidget);
      expect(
        find.text('Prof. Davis assigned you to Algorithms.'),
        findsOneWidget,
      );
      expect(find.byIcon(LucideIcons.bell), findsOneWidget);
      expect(find.byIcon(LucideIcons.chevronRight), findsOneWidget);

      // Tap on the notification card
      await tester.tap(find.text('New Class Assigned'));
      await tester.pumpAndSettle();

      // Verify tap callback was triggered
      expect(tapped, isTrue);

      // Verify banner is dismissed on tap
      expect(find.text('New Class Assigned'), findsNothing);
    },
  );

  testWidgets(
    'ServiceToast.showNotification supports dark mode styling and auto-dismisses',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: ThemeMode.dark, // Dark Mode!
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () {
                    ServiceToast.showNotification(
                      context,
                      title: 'FCM Background Message',
                      body: 'Testing auto-dismiss in dark mode.',
                      duration: const Duration(milliseconds: 500),
                    );
                  },
                  child: const Text('Show Dark Banner'),
                ),
              ),
            ),
          ),
        ),
      );

      // Tap button to show notification banner in dark mode
      await tester.tap(find.text('Show Dark Banner'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('FCM Background Message'), findsOneWidget);

      // Let the auto-dismiss timer run to completion
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      // Toast banner is gone!
      expect(find.text('FCM Background Message'), findsNothing);
    },
  );
}
