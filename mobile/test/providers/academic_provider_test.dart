import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/academic_provider.dart';

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
}
