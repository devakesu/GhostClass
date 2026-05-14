import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/institution.dart';

void main() {
  group('Institution Model', () {
    group('fromJson', () {
      test('handles nested institution and role objects', () {
        final institution = Institution.fromJson({
          'id': 5,
          'institution': {'name': 'State University'},
          'institution_role': {'name': 'Professor'},
        });

        expect(institution.id, 5);
        expect(institution.name, 'State University');
        expect(institution.role, 'Professor');
      });

      test('handles flat structure with fallback keys', () {
        final institution = Institution.fromJson({
          'id': '10',
          'name': 'City College',
          'role': 'Student',
        });

        expect(institution.id, 10);
        expect(institution.name, 'City College');
        expect(institution.role, 'Student');
      });

      test('applies defaults for missing data', () {
        final institution = Institution.fromJson({'id': 3});

        expect(institution.id, 3);
        expect(institution.name, 'Unknown Institution');
        expect(institution.role, 'institution');
      });

      test('prioritizes nested objects over flat keys', () {
        final institution = Institution.fromJson({
          'id': 7,
          'name': 'FlatCollege',
          'institution': {'name': 'NestedUniversity'},
          'role': 'flat-role',
          'institution_role': {'name': 'nested-role'},
        });

        expect(institution.id, 7);
        expect(institution.name, 'NestedUniversity');
        expect(institution.role, 'nested-role');
      });

      test('coerces id from different types', () {
        expect(Institution.fromJson({'id': 15.5}).id, 15);
        expect(Institution.fromJson({'id': '20'}).id, 20);
        expect(Institution.fromJson({'id': 'invalid'}).id, 0);
        expect(Institution.fromJson({}).id, 0);
      });

      test('handles null nested institution object', () {
        final institution = Institution.fromJson({
          'id': 25,
          'institution': null,
          'name': 'Fallback Name',
        });

        expect(institution.id, 25);
        expect(institution.name, 'Fallback Name');
      });

      test('handles null nested institution_role object', () {
        final institution = Institution.fromJson({
          'id': 26,
          'institution_role': null,
          'role': 'fallback-role',
        });

        expect(institution.id, 26);
        expect(institution.role, 'fallback-role');
      });

      test('handles nested institutions with null name field', () {
        final institution = Institution.fromJson({
          'id': 27,
          'institution': {'name': null},
          'name': 'Fallback Name',
        });

        expect(institution.id, 27);
        expect(institution.name, 'Fallback Name');
      });

      test('handles nested role with null name field', () {
        final institution = Institution.fromJson({
          'id': 28,
          'institution_role': {'name': null},
          'role': 'fallback-role',
        });

        expect(institution.id, 28);
        expect(institution.role, 'fallback-role');
      });

      test('handles int id in nested structure', () {
        final institution = Institution.fromJson({
          'id': 40.0,
          'institution': {'name': 'Tech Institute'},
          'institution_role': {'name': 'Admin'},
        });

        expect(institution.id, 40);
        expect(institution.name, 'Tech Institute');
        expect(institution.role, 'Admin');
      });

      test('handles complex nested structure with extra fields', () {
        final institution = Institution.fromJson({
          'id': 50,
          'institution': {
            'name': 'Advanced University',
            'founded': 1985,
            'country': 'USA',
          },
          'institution_role': {
            'name': 'Researcher',
            'level': 5,
          },
          'extra_field': 'ignored',
        });

        expect(institution.id, 50);
        expect(institution.name, 'Advanced University');
        expect(institution.role, 'Researcher');
      });
    });

    group('equality and identity', () {
      test('two institutions with identical data are equal', () {
        const inst1 = Institution(
          id: 100,
          name: 'Premium University',
          role: 'Dean',
        );

        const inst2 = Institution(
          id: 100,
          name: 'Premium University',
          role: 'Dean',
        );

        expect(inst1, inst2);
      });

      test('institutions with different ids are not equal', () {
        const inst1 = Institution(id: 101, name: 'College A', role: 'role1');
        const inst2 = Institution(id: 102, name: 'College A', role: 'role1');

        expect(inst1, isNot(inst2));
      });

      test('institutions with different names are not equal', () {
        const inst1 = Institution(id: 103, name: 'College B', role: 'role2');
        const inst2 = Institution(id: 103, name: 'College C', role: 'role2');

        expect(inst1, isNot(inst2));
      });

      test('institutions with different roles are not equal', () {
        const inst1 = Institution(id: 104, name: 'College D', role: 'admin');
        const inst2 = Institution(id: 104, name: 'College D', role: 'user');

        expect(inst1, isNot(inst2));
      });

      test('can be const constructed', () {
        const institution = Institution(
          id: 105,
          name: 'Const College',
          role: 'const-role',
        );

        expect(institution.id, 105);
        expect(institution.name, 'Const College');
        expect(institution.role, 'const-role');
      });
    });

    group('roundtrip', () {
      test('fromJson -> structure roundtrip with nested data', () {
        final original = {
          'id': 200,
          'institution': {'name': 'Science Institute'},
          'institution_role': {'name': 'Lecturer'},
        };

        final institution = Institution.fromJson(original);

        expect(institution.id, 200);
        expect(institution.name, 'Science Institute');
        expect(institution.role, 'Lecturer');
      });

      test('fromJson with flat keys structure', () {
        final original = {
          'id': 201,
          'name': 'Arts College',
          'role': 'Instructor',
        };

        final institution = Institution.fromJson(original);

        expect(institution.id, 201);
        expect(institution.name, 'Arts College');
        expect(institution.role, 'Instructor');
      });

      test('handles double-nested structure consistently', () {
        final json = {
          'id': 202,
          'institution': {'name': 'Complex University'},
          'institution_role': {'name': 'Researcher'},
          'name': 'Ignored',
          'role': 'Ignored',
        };

        final inst = Institution.fromJson(json);

        expect(inst.name, 'Complex University');
        expect(inst.role, 'Researcher');
      });
    });

    group('edge cases', () {
      test('handles completely empty JSON', () {
        final institution = Institution.fromJson({});

        expect(institution.id, 0);
        expect(institution.name, 'Unknown Institution');
        expect(institution.role, 'institution');
      });

      test('handles all null values', () {
        final institution = Institution.fromJson({
          'id': null,
          'institution': null,
          'institution_role': null,
          'name': null,
          'role': null,
        });

        expect(institution.id, 0);
        expect(institution.name, 'Unknown Institution');
        expect(institution.role, 'institution');
      });

      test('handles very large id values', () {
        final institution = Institution.fromJson({
          'id': 2147483647,
          'name': 'Big ID College',
        });

        expect(institution.id, 2147483647);
      });

      test('handles special characters in name and role', () {
        final institution = Institution.fromJson({
          'id': 210,
          'institution': {'name': "O'Brien's University & Co."},
          'institution_role': {'name': 'Lead Researcher (PhD)'},
        });

        expect(institution.name, "O'Brien's University & Co.");
        expect(institution.role, 'Lead Researcher (PhD)');
      });

      test('handles very long strings', () {
        final longName = 'A' * 1000;
        final institution = Institution.fromJson({
          'id': 211,
          'institution': {'name': longName},
        });

        expect(institution.name, longName);
        expect(institution.name.length, 1000);
      });
    });
  });
}
