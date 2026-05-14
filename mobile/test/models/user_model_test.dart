import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';

void main() {
  group('UserProfile Model', () {
    group('fromJson', () {
      test('correctly deserializes full user profile data', () {
        final json = {
          'first_name': 'John',
          'last_name': 'Doe',
          'avatar_url': 'https://example.com/avatar.jpg',
          'email': 'john@example.com',
          'phone': '+1234567890',
          'birth_date': '1995-05-15',
          'gender': 'M',
          'last_synced_at': '2024-01-15T10:30:00.000Z',
          'current_semester': '5',
          'current_year': '3',
          'created_at': '2023-01-01T00:00:00.000Z',
          'ezygo_created_at': '2023-01-01T00:00:00.000Z',
          'class': {
            'id': 'class001',
            'name': 'Engineering - CSE',
          },
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.firstName, 'John');
        expect(profile.lastName, 'Doe');
        expect(profile.avatarUrl, 'https://example.com/avatar.jpg');
        expect(profile.email, 'john@example.com');
        expect(profile.phone, '+1234567890');
        expect(profile.birthDate, '1995-05-15');
        expect(profile.gender, 'M');
        expect(profile.currentSemester, '5');
        expect(profile.currentYear, '3');
        expect(profile.classField, isNotNull);
        expect(profile.classField?.name, 'Engineering - CSE');
      });

      test('handles numeric createdAt timestamp', () {
        final json = {
          'first_name': 'John',
          'last_name': 'Doe',
          'email': 'john@example.com',
          'created_at': 1609459200000, // milliseconds
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.createdAt, isNotNull);
        expect(profile.firstName, 'John');
      });

      test('handles createdAt as seconds (old format)', () {
        final json = {
          'first_name': 'Jane',
          'last_name': 'Smith',
          'email': 'jane@example.com',
          'created_at': 1609459200, // seconds
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.createdAt, isNotNull);
        expect(profile.firstName, 'Jane');
      });

      test('handles null optional fields', () {
        final json = {
          'first_name': null,
          'last_name': null,
          'avatar_url': null,
          'email': 'test@example.com',
          'phone': null,
          'birth_date': null,
          'gender': null,
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.firstName, isNull);
        expect(profile.lastName, isNull);
        expect(profile.avatarUrl, isNull);
        expect(profile.email, 'test@example.com');
        expect(profile.phone, isNull);
      });

      test('handles class as string', () {
        final json = {
          'first_name': 'Bob',
          'email': 'bob@example.com',
          'class': 'Engineering',
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.classField, isNotNull);
        expect(profile.classField?.name, 'Engineering');
      });

      test('handles missing class field', () {
        final json = {
          'first_name': 'Alice',
          'email': 'alice@example.com',
        };

        final profile = UserProfile.fromJson(json);

        expect(profile.classField, isNull);
      });
    });

    group('fullName getter', () {
      test('returns combined first and last name', () {
        const profile = UserProfile(
          firstName: 'John',
          lastName: 'Doe',
        );

        expect(profile.fullName, 'John Doe');
      });

      test('returns only first name when last name is null', () {
        const profile = UserProfile(
          firstName: 'John',
        );

        expect(profile.fullName, 'John');
      });

      test('returns only last name when first name is null', () {
        const profile = UserProfile(
          lastName: 'Doe',
        );

        expect(profile.fullName, 'Doe');
      });

      test('returns null when both names are null', () {
        const profile = UserProfile();

        expect(profile.fullName, isNull);
      });

      test('trims extra whitespace', () {
        const profile = UserProfile(
          firstName: 'John',
        );

        expect(profile.fullName, 'John');
      });
    });

    group('copyWith', () {
      test('creates a copy with updated fields', () {
        const profile = UserProfile(
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
        );

        final updated = profile.copyWith(
          firstName: 'Jane',
          email: 'jane@example.com',
        );

        expect(updated.firstName, 'Jane');
        expect(updated.lastName, 'Doe');
        expect(updated.email, 'jane@example.com');
        expect(updated.phone, '+1234567890');
      });

      test('preserves original instance', () {
        const profile = UserProfile(
          firstName: 'John',
          email: 'john@example.com',
        );

        final updated = profile.copyWith(firstName: 'Jane');

        expect(profile.firstName, 'John');
        expect(updated.firstName, 'Jane');
      });

      test('updates multiple fields at once', () {
        const profile = UserProfile(
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          email: 'john@example.com',
        );

        final updated = profile.copyWith(
          firstName: 'Johnny',
          lastName: 'Smith',
        );

        expect(updated.firstName, 'Johnny');
        expect(updated.lastName, 'Smith');
        expect(updated.phone, '+1234567890');
        expect(updated.email, 'john@example.com');
      });
    });

    group('equality', () {
      test('two profiles with same data are equal', () {
        const profile1 = UserProfile(
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        );

        const profile2 = UserProfile(
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        );

        expect(profile1, profile2);
      });

      test('two profiles with different data are not equal', () {
        const profile1 = UserProfile(
          firstName: 'John',
          email: 'john@example.com',
        );

        const profile2 = UserProfile(
          firstName: 'Jane',
          email: 'john@example.com',
        );

        expect(profile1, isNot(profile2));
      });
    });
  });

  group('UserClass Model', () {
    test('creates UserClass with required fields', () {
      final userClass = UserClass(id: 'class001', name: 'Engineering - CSE');

      expect(userClass.id, 'class001');
      expect(userClass.name, 'Engineering - CSE');
    });

    test('can be created from JSON', () {
      final json = {
        'id': 'class002',
        'name': 'Science - Physics',
      };

      final userClass = UserClass.fromJson(json);

      expect(userClass.id, 'class002');
      expect(userClass.name, 'Science - Physics');
    });

    test('can be converted to JSON', () {
      final userClass = UserClass(id: 'class001', name: 'Engineering');

      final json = userClass.toJson();

      expect(json['id'], 'class001');
      expect(json['name'], 'Engineering');
    });
  });
}
