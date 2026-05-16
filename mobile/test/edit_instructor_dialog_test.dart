import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/widgets/attendance/edit_instructor_dialog.dart';

void main() {
  testWidgets(
    'EditInstructorDialog shows fields and SAVE disabled when unchanged',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => const EditInstructorDialog(
                      courseCode: 'CS101',
                      courseName: 'Intro',
                      initialName: 'Dr. Test',
                    ),
                  ),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Edit Instructor'), findsOneWidget);
      expect(find.text('Instructor Name'), findsOneWidget);

      final saveButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'SAVE CHANGES'),
      );
      expect(saveButton.onPressed, isNull);

      // Enter a different name and verify SAVE becomes enabled
      await tester.enterText(find.byType(TextFormField), 'Dr New');
      await tester.pump();

      final saveButtonAfter = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'SAVE CHANGES'),
      );
      expect(saveButtonAfter.onPressed, isNotNull);
    },
  );
}
