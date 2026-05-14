import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/course_instructor.dart';

void main() {
  group('CourseInstructor', () {
    group('fromJson', () {
      test('reads snake_case and toJson preserves data', () {
        final instructor = CourseInstructor.fromJson({
          'id': 12,
          'course_code': 'CS101',
          'instructor_name': 'Dr Ada',
          'course_name': 'Intro to CS',
        });

        expect(instructor.id, 12);
        expect(instructor.courseCode, 'CS101');
        expect(instructor.instructorName, 'Dr Ada');
        expect(instructor.courseName, 'Intro to CS');
        expect(instructor.toJson(), {
          'id': 12,
          'course_code': 'CS101',
          'instructor_name': 'Dr Ada',
          'course_name': 'Intro to CS',
        });
      });

      test('accepts camelCase keys and coerces id values', () {
        final instructor = CourseInstructor.fromJson({
          'id': 15.0,
          'courseCode': 'MATH200',
          'instructorName': 'Prof Euler',
        });

        expect(instructor.id, 15);
        expect(instructor.courseCode, 'MATH200');
        expect(instructor.instructorName, 'Prof Euler');
        expect(instructor.courseName, isNull);
      });

      test('prioritizes snake_case over camelCase', () {
        final instructor = CourseInstructor.fromJson({
          'id': 20,
          'course_code': 'PHYS301',
          'courseCode': 'WRONG301',
          'instructor_name': 'Dr Newton',
          'instructorName': 'Wrong Name',
        });

        expect(instructor.courseCode, 'PHYS301');
        expect(instructor.instructorName, 'Dr Newton');
      });

      test('falls back when fields are missing or malformed', () {
        final instructor = CourseInstructor.fromJson({'id': 'abc'});

        expect(instructor.id, isNull);
        expect(instructor.courseCode, '');
        expect(instructor.instructorName, '');
        expect(instructor.courseName, isNull);
      });

      test('converts id from int, double, and string', () {
        expect(CourseInstructor.fromJson({'id': 25, 'course_code': 'C', 'instructor_name': 'I'}).id, 25);
        expect(CourseInstructor.fromJson({'id': 26.7, 'course_code': 'C', 'instructor_name': 'I'}).id, 26);
        expect(CourseInstructor.fromJson({'id': '27', 'course_code': 'C', 'instructor_name': 'I'}).id, 27);
        expect(CourseInstructor.fromJson({'id': 'invalid', 'course_code': 'C', 'instructor_name': 'I'}).id, isNull);
      });

      test('handles null id explicitly', () {
        final instructor = CourseInstructor.fromJson({
          'id': null,
          'course_code': 'BIO101',
          'instructor_name': 'Dr Darwin',
        });

        expect(instructor.id, isNull);
        expect(instructor.courseCode, 'BIO101');
      });

      test('coerces course_code and instructor_name with .toString()', () {
        final instructor = CourseInstructor.fromJson({
          'id': 30,
          'course_code': 'PHYS101',
          'instructor_name': 'Dr. Smith',
          'course_name': 'Physics 101',
        });

        expect(instructor.courseCode, 'PHYS101');
        expect(instructor.instructorName, 'Dr. Smith');
        expect(instructor.courseName, 'Physics 101');
      });

      test('handles completely empty JSON', () {
        final instructor = CourseInstructor.fromJson({});

        expect(instructor.id, isNull);
        expect(instructor.courseCode, '');
        expect(instructor.instructorName, '');
        expect(instructor.courseName, isNull);
      });

      test('handles mixed field casing with null optional', () {
        final instructor = CourseInstructor.fromJson({
          'id': 35,
          'course_code': 'CHEM101',
          'instructor_name': 'Prof Mendeleev',
          'course_name': null,
        });

        expect(instructor.id, 35);
        expect(instructor.courseName, isNull);
      });
    });

    group('toJson', () {
      test('serializes with snake_case keys', () {
        const instructor = CourseInstructor(
          id: 40,
          courseCode: 'HIST301',
          instructorName: 'Dr Caesar',
          courseName: 'Ancient Rome',
        );

        final json = instructor.toJson();

        expect(json['id'], 40);
        expect(json['course_code'], 'HIST301');
        expect(json['instructor_name'], 'Dr Caesar');
        expect(json['course_name'], 'Ancient Rome');
      });

      test('includes null courseName in output', () {
        const instructor = CourseInstructor(
          id: 45,
          courseCode: 'ART101',
          instructorName: 'Prof Picasso',
        );

        final json = instructor.toJson();

        expect(json.containsKey('course_name'), true);
        expect(json['course_name'], isNull);
      });
    });

    group('roundtrip', () {
      test('fromJson -> toJson preserves data consistency', () {
        final original = {
          'id': 50,
          'course_code': 'MUS201',
          'instructor_name': 'Prof Mozart',
          'course_name': 'Classical Composition',
        };

        final instructor = CourseInstructor.fromJson(original);
        final json = instructor.toJson();

        expect(json['id'], original['id']);
        expect(json['course_code'], original['course_code']);
        expect(json['instructor_name'], original['instructor_name']);
        expect(json['course_name'], original['course_name']);
      });

      test('handles roundtrip with missing courseName', () {
        final original = {
          'id': 55,
          'course_code': 'DANCE101',
          'instructor_name': 'Prof Balanchine',
        };

        final instructor = CourseInstructor.fromJson(original);
        final json = instructor.toJson();

        expect(json['course_name'], isNull);
      });

      test('handles roundtrip with camelCase input and snake_case output', () {
        final input = {
          'id': 60,
          'courseCode': 'DRAMA101',
          'instructorName': 'Prof Shakespeare',
          'courseName': 'Theater',
        };

        final instructor = CourseInstructor.fromJson(input);
        final json = instructor.toJson();

        expect(json['course_code'], 'DRAMA101');
        expect(json['instructor_name'], 'Prof Shakespeare');
      });
    });

    group('equality and identity', () {
      test('two instructors with identical data are equal', () {
        const inst1 = CourseInstructor(
          id: 65,
          courseCode: 'FILM301',
          instructorName: 'Prof Kurosawa',
          courseName: 'Cinema',
        );

        const inst2 = CourseInstructor(
          id: 65,
          courseCode: 'FILM301',
          instructorName: 'Prof Kurosawa',
          courseName: 'Cinema',
        );

        expect(inst1, inst2);
      });

      test('instructors with different ids are not equal', () {
        const inst1 = CourseInstructor(
          id: 70,
          courseCode: 'PHOTO101',
          instructorName: 'Prof Adams',
        );

        const inst2 = CourseInstructor(
          id: 71,
          courseCode: 'PHOTO101',
          instructorName: 'Prof Adams',
        );

        expect(inst1, isNot(inst2));
      });

      test('instructors with different course codes are not equal', () {
        const inst1 = CourseInstructor(
          id: 72,
          courseCode: 'ARCH101',
          instructorName: 'Prof Wright',
        );

        const inst2 = CourseInstructor(
          id: 72,
          courseCode: 'ARCH102',
          instructorName: 'Prof Wright',
        );

        expect(inst1, isNot(inst2));
      });

      test('can be const constructed', () {
        const instructor = CourseInstructor(
          id: 75,
          courseCode: 'ENG201',
          instructorName: 'Prof Austen',
          courseName: 'Literature',
        );

        expect(instructor.id, 75);
        expect(instructor.courseCode, 'ENG201');
      });
    });
  });
}