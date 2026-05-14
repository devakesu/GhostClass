import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/course_details.dart';

void main() {
  group('CourseDetails', () {
    test('fromJson and toJson map standard structures', () {
      final json = {
        'id': 101,
        'name': 'Algorithms',
        'code': 'CS201',
        'academic_year': '2026',
        'academic_semester': 'S3',
        'usersubgroup': {
          'usergroup': {'name': 'GroupA'},
        },
        'institution_users': [
          {
            'first_name': 'Prof',
            'last_name': 'Smith',
            'pivot': {'courserole_id': 2},
          },
        ],
      };

      final c = CourseDetails.fromJson(json);
      expect(c.id, 101);
      expect(c.name, 'Algorithms');
      expect(c.safeId, 'CS201');
      expect(c.userGroupName, 'GroupA');
      expect(c.institutionUsers.length, 1);
      expect(c.institutionUsers[0].firstName, 'Prof');
      expect(c.institutionUsers[0].pivot.courseroleId, 2);

      final expectedJson = {
        'id': 101,
        'name': 'Algorithms',
        'code': 'CS201',
        'academic_year': '2026',
        'academic_semester': 'S3',
        'user_group_name': 'GroupA',
      };
      expect(c.toJson(), expectedJson);
    });

    test('safeId fallback logic works', () {
      expect(const CourseDetails(id: 12, name: 'Test').safeId, '12');
      expect(
        const CourseDetails(id: 12, name: 'Test', code: '  ').safeId,
        '12',
      );
    });

    test('fromJson handles int, double, and string ids gracefully', () {
      expect(CourseDetails.fromJson({'id': 5}).id, 5);
      expect(CourseDetails.fromJson({'id': 5.0}).id, 5);
      expect(CourseDetails.fromJson({'id': '5'}).id, 5);
      expect(CourseDetails.fromJson({'id': 'abc'}).id, 0);
    });

    test('defaults to "Unknown Course" if name is missing', () {
      final course = CourseDetails.fromJson({'id': 10});
      expect(course.name, 'Unknown Course');
    });

    test('extracts userGroupName from nested usersubgroup structure', () {
      final json = {
        'id': 20,
        'name': 'OOP',
        'usersubgroup': {
          'usergroup': {
            'name': 'Lecture B',
          }
        },
      };
      final course = CourseDetails.fromJson(json);
      expect(course.userGroupName, 'Lecture B');
    });

    test('falls back to user_group_name if nested structure is unavailable', () {
      final json = {
        'id': 30,
        'name': 'DBMS',
        'user_group_name': 'Tutorial 1',
      };
      final course = CourseDetails.fromJson(json);
      expect(course.userGroupName, 'Tutorial 1');
    });

    test('handles malformed usersubgroup gracefully', () {
      final json = {
        'id': 40,
        'name': 'Networks',
        'usersubgroup': 'not_a_map',
      };
      final course = CourseDetails.fromJson(json);
      expect(course.userGroupName, isNull);
    });

    test('handles empty institution_users list', () {
      final json = {
        'id': 50,
        'name': 'Operating Systems',
        'institution_users': [],
      };
      final course = CourseDetails.fromJson(json);
      expect(course.institutionUsers, isEmpty);
    });

    test('filters out non-map items from institution_users', () {
      final json = {
        'id': 60,
        'name': 'Compiler Design',
        'institution_users': [
          'string_item',
          null,
          {'first_name': 'Dr', 'last_name': 'Lee', 'pivot': {}},
          123,
        ],
      };
      final course = CourseDetails.fromJson(json);
      expect(course.institutionUsers.length, 1);
      expect(course.institutionUsers[0].firstName, 'Dr');
    });

    test('handles missing institution_users field', () {
      final json = {
        'id': 70,
        'name': 'Graphics',
      };
      final course = CourseDetails.fromJson(json);
      expect(course.institutionUsers, isEmpty);
    });

    test('codes are trimmed in safeId', () {
      expect(
        const CourseDetails(id: 80, name: 'Web', code: '  WEB101  ').safeId,
        'WEB101',
      );
    });

    test('can be const constructed', () {
      const course = CourseDetails(id: 90, name: 'Security');
      expect(course.id, 90);
      expect(course.name, 'Security');
    });

    test('equality works correctly', () {
      const course1 = CourseDetails(id: 100, name: 'AI', code: 'AI100');
      const course2 = CourseDetails(id: 100, name: 'AI', code: 'AI100');
      const course3 = CourseDetails(id: 101, name: 'AI', code: 'AI100');

      expect(course1, course2);
      expect(course1, isNot(course3));
    });
  });

  group('CourseInstitutionUser', () {
    test('parses from JSON with pivot data', () {
      final json = {
        'first_name': 'Prof',
        'last_name': 'Smith',
        'pivot': {
          'course_id': 101,
          'institution_user_id': 50,
          'courserole_id': 1,
        }
      };
      final user = CourseInstitutionUser.fromJson(json);
      expect(user.firstName, 'Prof');
      expect(user.lastName, 'Smith');
      expect(user.pivot.courseroleId, 1);
    });

    test('handles missing pivot gracefully', () {
      final json = {
        'first_name': 'Assist',
        'last_name': 'Johnson',
      };
      final user = CourseInstitutionUser.fromJson(json);
      expect(user.firstName, 'Assist');
      expect(user.lastName, 'Johnson');
      expect(user.pivot, isNotNull);
    });

    test('handles null pivot gracefully', () {
      final json = {
        'first_name': 'TA',
        'last_name': 'Wilson',
        'pivot': null,
      };
      final user = CourseInstitutionUser.fromJson(json);
      expect(user.firstName, 'TA');
      expect(user.lastName, 'Wilson');
      expect(user.pivot, isNotNull);
    });
  });
}
