import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/widgets/attendance/add_course_dialog.dart';

void main() {
  testWidgets('AddCourseDialog renders fields and buttons', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const AddCourseDialog(
                    semester: '1',
                    academicYear: '2025',
                    className: 'A',
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

    expect(find.text('Add New Course'), findsOneWidget);
    expect(find.text('Course Code (e.g. GAMAT201)'), findsOneWidget);
    expect(find.text('Course Name'), findsOneWidget);
    expect(find.text('Add Course to Lineup'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
  });
}
