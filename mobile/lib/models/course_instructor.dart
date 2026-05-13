class CourseInstructor {

  const CourseInstructor({
    required this.courseCode, required this.instructorName, this.id,
    this.courseName,
  });

  factory CourseInstructor.fromJson(Map<String, dynamic> json) {
    return CourseInstructor(
      id: _toInt(json['id']),
      courseCode: (json['course_code'] ?? json['courseCode'] ?? '').toString(),
      instructorName: (json['instructor_name'] ?? json['instructorName'] ?? '')
          .toString(),
      courseName:
          json['course_name'] as String? ?? json['courseName'] as String?,
    );
  }
  final int? id;
  final String courseCode;
  final String instructorName;
  final String? courseName;

  Map<String, dynamic> toJson() => {
    'id': id,
    'course_code': courseCode,
    'instructor_name': instructorName,
    'course_name': courseName,
  };
}

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
