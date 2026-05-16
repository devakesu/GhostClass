import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';

void main() {
  testWidgets('LoadingOverlay renders non-fullscreen without crash', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(
          body: Center(
            child: SizedBox(
              width: 300,
              height: 300,
              child: LoadingOverlay(
                isFullScreen: false,
                showLogo: false,
                message: 'Testing overlay',
              ),
            ),
          ),
        ),
      ),
    );

    // Don't use pumpAndSettle since the widget animates indefinitely; advance a few frames
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Testing overlay'), findsOneWidget);
    expect(find.text('This might take a few seconds'), findsOneWidget);
  });
}
