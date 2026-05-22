import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';

import '../coverage_helper.dart';

class MockApiService extends Mock implements ApiService {}

class MockSecureStorageService extends Mock implements SecureStorageService {}

void main() {
  group('AcademicState', () {
    test('copyWith and equality follow value semantics', () {
      const base = AcademicState(semester: 'Odd Semester', year: '2025-2026');
      final updated = base.copyWith(year: '2026-2027');

      expect(updated.semester, 'Odd Semester');
      expect(updated.year, '2026-2027');
      expect(base == updated, false);
      expect(base == base, true);
      expect(base.hashCode, isNotNull);
    });

    test('derives semester date ranges for odd, even, and unknown labels', () {
      const odd = AcademicState(semester: 'Odd', year: '2025-2026');
      const even = AcademicState(semester: 'Even', year: '2025-2026');
      const spring = AcademicState(semester: 'Spring', year: '2025-2026');
      const unknown = AcademicState(semester: 'Winter', year: '2025-2026');

      expect(odd.startDate, DateTime(2025, 7));
      expect(odd.endDate, DateTime(2025, 12, 31, 23, 59, 59));
      expect(even.startDate, DateTime(2026));
      expect(even.endDate, DateTime(2026, 6, 30, 23, 59, 59));
      expect(spring.startDate, DateTime(2026));
      expect(spring.endDate, DateTime(2026, 6, 30, 23, 59, 59));
      expect(unknown.startDate, DateTime(2026));
      expect(unknown.endDate, DateTime(2026, 6, 30, 23, 59, 59));
    });
  });

  group('AcademicNotifier', () {
    test(
      'uses auth-seeded academic values on startup without duplicate EzyGo fetches',
      () async {
        final mockApi = MockApiService();
        final mockStorage = MockSecureStorageService();
        const staleAcademic = AcademicState(
          semester: 'even',
          year: '2025-2026',
        );
        const freshAcademic = AcademicState(
          semester: 'odd',
          year: '2025-2026',
        );
        final user = createMockUser().copyWith(
          profile: const UserProfile(
            currentSemester: 'odd',
            currentYear: '2025-2026',
          ),
          settings: UserSettings(
            bunkCalculatorEnabled: true,
            targetPercentage: 75,
            disabledCourses: const {},
            semester: staleAcademic.semester,
            academicYear: staleAcademic.year,
          ),
        );

        when(
          () => mockStorage.saveAcademicState(freshAcademic),
        ).thenAnswer((_) async {});
        when(
          mockStorage.getAcademicState,
        ).thenAnswer((_) async => staleAcademic);

        final container = ProviderContainer(
          overrides: [
            authProvider.overrideWith(() => MockAuthNotifier(user)),
            apiServiceProvider.overrideWithValue(mockApi),
            secureStorageProvider.overrideWithValue(mockStorage),
          ],
        );
        addTearDown(container.dispose);

        final result = await container.read(academicProvider.future);

        expect(result, freshAcademic);
        verify(() => mockStorage.saveAcademicState(freshAcademic)).called(1);
        verifyNever(mockApi.clearCaches);
        verifyNever(() => mockApi.fetchSemester(mockStorage));
        verifyNever(() => mockApi.fetchAcademicYear(mockStorage));
        verifyNever(mockStorage.getAcademicState);
      },
    );
  });
}
