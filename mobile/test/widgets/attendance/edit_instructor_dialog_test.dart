import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/widgets/attendance/edit_instructor_dialog.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

import '../../coverage_helper.dart';

class MockApiService extends Mock implements ApiService {}

class MockSupabaseClient extends Mock implements supabase.SupabaseClient {}

class MockGoTrueClient extends Mock implements supabase.GoTrueClient {}

class MockSession extends Mock implements supabase.Session {}

class TestMockDashboardNotifier extends MockDashboardNotifier {
  TestMockDashboardNotifier(super.data);

  @override
  Future<void> refresh() async {
    // No-op for testing
  }

  @override
  Future<void> updateLocalInstructor(
    String courseCode,
    String instructorName,
  ) async {
    // No-op for testing
  }
}

void main() {
  late MockApiService mockApi;
  late MockSupabaseClient mockSupabase;
  late MockGoTrueClient mockAuth;
  late MockSession mockSession;

  setUp(() {
    mockApi = MockApiService();
    mockSupabase = MockSupabaseClient();
    mockAuth = MockGoTrueClient();
    mockSession = MockSession();

    when(() => mockSupabase.auth).thenReturn(mockAuth);
    when(() => mockAuth.currentSession).thenReturn(mockSession);
    when(() => mockSession.accessToken).thenReturn('test-supabase-token');
  });

  testWidgets(
    'EditInstructorDialog shows fields, disables SAVE when unchanged, and calls API on save',
    (tester) async {
      final mockUserVal = AuthenticatedUser(
        supabaseUserId: 'user-123',
        username: 'testuser',
        settings: UserSettings.defaults(),
        ezygoToken: EncryptedValue.fromPlaintext('testtoken'),
        profile: UserProfile(
          firstName: 'Test',
          classField: UserClass(id: 'class-456', name: 'Class 456'),
        ),
      );

      const mockAcademicVal = AcademicState(
        semester: 'odd',
        year: '2024-2025',
      );

      when(
        () => mockApi.upsertInstructor(
          courseCode: any(named: 'courseCode'),
          instructorName: any(named: 'instructorName'),
          semester: any(named: 'semester'),
          academicYear: any(named: 'academicYear'),
          supabaseToken: any(named: 'supabaseToken'),
        ),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/api/instructors/upsert'),
          statusCode: 200,
          data: {'message': 'Success'},
        ),
      );

      final overrides = [
        authProvider.overrideWith(
          () => MockAuthNotifier(mockUserVal),
        ),
        academicProvider.overrideWith(
          () => MockAcademicNotifier(mockAcademicVal),
        ),
        apiServiceProvider.overrideWithValue(mockApi),
        supabaseClientProvider.overrideWithValue(mockSupabase),
        dashboardProvider.overrideWith(
          () => TestMockDashboardNotifier(createMockDashboardData()),
        ),
      ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: overrides,
          child: MaterialApp(
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
      await tester.enterText(find.byType(TextFormField), 'Dr. New');
      await tester.pump();

      final saveButtonAfter = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'SAVE CHANGES'),
      );
      expect(saveButtonAfter.onPressed, isNotNull);

      // Tap SAVE CHANGES
      await tester.tap(find.widgetWithText(ElevatedButton, 'SAVE CHANGES'));
      await tester.pump();

      // Verify API was called
      verify(
        () => mockApi.upsertInstructor(
          courseCode: 'CS101',
          instructorName: 'Dr. New',
          semester: 'odd',
          academicYear: '2024-2025',
          supabaseToken: 'test-supabase-token',
        ),
      ).called(1);
    },
  );
}
