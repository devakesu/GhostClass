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
      expect(const CourseDetails(id: 12, name: 'Test', code: '  ').safeId, '12');
    });

    test('fromJson handles int, double, and string ids gracefully', () {
      expect(CourseDetails.fromJson({'id': 5}).id, 5);
      expect(CourseDetails.fromJson({'id': 5.0}).id, 5);
      expect(CourseDetails.fromJson({'id': '5'}).id, 5);
      expect(CourseDetails.fromJson({'id': 'abc'}).id, 0);
    });
  });
}
