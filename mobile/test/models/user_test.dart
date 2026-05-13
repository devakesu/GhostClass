import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';

void main() {
  group('UserProfile & UserClass Models', () {
    test('UserProfile.fullName computes correctly', () {
      expect(const UserProfile(firstName: 'Jane', lastName: 'Smith').fullName, 'Jane Smith');
      expect(const UserProfile(firstName: 'Jane').fullName, 'Jane');
      expect(const UserProfile(lastName: 'Smith').fullName, 'Smith');
      expect(const UserProfile().fullName, isNull);
    });

    test('UserProfile copyWith, equals, and hashCode work', () {
      final p1 = UserProfile(
        firstName: 'John',
        lastName: 'Doe',
        classField: UserClass(id: 'c1', name: 'CS'),
      );
      final p2 = p1.copyWith(firstName: 'Johnny');
      expect(p2.firstName, 'Johnny');
      expect(p1 == p2, false);
      expect(p1 == p1, true);
      expect(p1.hashCode, isNotNull);
    });

    test('UserProfile.fromJson parses standard structures and numerical timestamps', () {
      final jsonSecs = {
        'first_name': 'A',
        'last_name': 'B',
        'created_at': 1600000000, // seconds
        'ezygo_created_at': '2026-05-11',
        'class': {'id': 'cls1', 'name': 'Class A'},
      };
      final pSecs = UserProfile.fromJson(jsonSecs);
      expect(pSecs.createdAt, isNotNull);
      expect(pSecs.classField?.name, 'Class A');

      final jsonMs = {
        'created_at': 1600000000000, // milliseconds
        'class': 'StringClass',
      };
      final pMs = UserProfile.fromJson(jsonMs);
      expect(pMs.createdAt, isNotNull);
      expect(pMs.classField?.name, 'StringClass');
      expect(pMs.toJson(), isMap);
    });
  });

  group('UserSettings Model', () {
    test('UserSettings copyWith and equals/hashCode work', () {
      final defaults = UserSettings.defaults();
      final updated = defaults.copyWith(targetPercentage: 80);
      expect(updated.targetPercentage, 80);
      expect(defaults == updated, false);
      expect(updated == updated, true);
      expect(updated.hashCode, isNotNull);
    });

    test('UserSettings helper getters work', () {
      const settings = UserSettings(
        bunkCalculatorEnabled: true,
        targetPercentage: 75,
        disabledCourses: {
          'odd': {'CS101': 'Intro', 'CS102': 'Data'},
          'even': {'CS101': 'Intro'},
        },
      );
      expect(settings.disabledCount, 3);
      expect(settings.flatDisabledCourses, ['CS101', 'CS102']); // sorted unique
    });

    test('UserSettings.fromJson and toJson map nested maps deeply', () {
      final json = {
        'bunk_calculator_enabled': false,
        'target_percentage': 85,
        'semester': 'S1',
        'academic_year': '2026',
        'disabled_courses': {
          'sem1': {'C1': 'Course1'},
        },
      };

      final s = UserSettings.fromJson(json);
      expect(s.bunkCalculatorEnabled, false);
      expect(s.targetPercentage, 85);
      expect(s.disabledCourses['sem1']?['C1'], 'Course1');
      expect(s.toJson(), json);

      // Verify deeply nested maps inequality logic
      final sDifferent = s.copyWith(
        disabledCourses: {
          'sem1': {'C1': 'DifferentValue'},
        },
      );
      expect(s == sDifferent, false);

      final sDifferentKeys = s.copyWith(
        disabledCourses: {
          'sem2': {'C1': 'Course1'},
        },
      );
      expect(s == sDifferentKeys, false);
    });
  });

  group('StealthInfo Model', () {
    test('fromJson and toJson map standard payload', () {
      final json = {
        'browserName': 'Chrome',
        'browserVersion': '120',
        'userAgent': 'UA',
        'secChUa': 'Sec',
      };
      final info = StealthInfo.fromJson(json);
      expect(info.browserName, 'Chrome');
      expect(info.toJson(), json);
    });
  });
}
