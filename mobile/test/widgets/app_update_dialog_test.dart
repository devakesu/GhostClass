import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/widgets/app_update_dialog.dart';
import 'package:lucide_icons/lucide_icons.dart';

void main() {
  testWidgets('AppUpdateDialog renders optional update layout correctly', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () async {
                  await AppUpdateDialog.show(
                    context,
                    '3.1.0',
                    isForceUpdate: false,
                  );
                },
                child: const Text('Show Dialog'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show Dialog'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    // Verify dialog content
    expect(find.text('New Update Available!'), findsOneWidget);
    expect(find.text('v3.0.8'), findsOneWidget); // Current version
    expect(find.text('v3.1.0'), findsOneWidget); // Latest version
    expect(
      find.text(
        'A new version of GhostClass (v3.1.0) is available! We highly recommend updating now to experience improved stability and fresh features.',
      ),
      findsOneWidget,
    );

    // Verify icons and buttons
    expect(find.byIcon(LucideIcons.arrowUpCircle), findsOneWidget);
    expect(find.text('Update Now'), findsOneWidget);
    expect(find.text('Later'), findsOneWidget);
    expect(find.text('Contact Support'), findsOneWidget);

    // Scroll down to reveal off-screen elements in small viewports
    await tester.drag(
      find.byType(SingleChildScrollView),
      const Offset(0, -200),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    // Tap Later and verify dismisses dialog
    await tester.tap(find.text('Later'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    expect(find.text('New Update Available!'), findsNothing);
  });

  testWidgets('AppUpdateDialog renders forced update layout correctly', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () async {
                  await AppUpdateDialog.show(
                    context,
                    '3.1.0',
                    isForceUpdate: true,
                  );
                },
                child: const Text('Show Dialog'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show Dialog'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));

    // Verify dialog content
    expect(find.text('Critical Update Required'), findsOneWidget);
    expect(find.text('v3.0.8'), findsOneWidget); // Current version
    expect(find.text('v3.1.0'), findsOneWidget); // Latest version
    expect(
      find.text(
        'A critical new security and feature update is required to continue using GhostClass. Please download the latest version (v3.1.0) to stay secure.',
      ),
      findsOneWidget,
    );

    // Verify icons and buttons
    expect(find.byIcon(LucideIcons.alertTriangle), findsOneWidget);
    expect(find.text('Update Now'), findsOneWidget);
    expect(find.text('Later'), findsNothing); // No later/dismiss button
    expect(find.text('Contact Support'), findsOneWidget);

    // Tap Update Now and ensure no crash
    await tester.tap(find.text('Update Now'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
  });
}
