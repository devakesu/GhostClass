class CourseDetails {

  const CourseDetails({
    required this.id,
    required this.name,
    this.code,
    this.academicYear,
    this.academicSemester,
    this.userGroupName,
    this.institutionUsers = const [],
  });

  factory CourseDetails.fromJson(Map<String, dynamic> json) {
    String? userGroupName;
    final usersubgroup = json['usersubgroup'];
    if (usersubgroup is Map<dynamic, dynamic>) {
      final usergroup = usersubgroup['usergroup'];
      if (usergroup is Map<dynamic, dynamic>) {
        userGroupName = usergroup['name']?.toString();
      }
    }

    final rawInstitutionUsers = json['institution_users'] as List<dynamic>? ?? const [];

    return CourseDetails(
      id: _toInt(json['id']) ?? 0,
      name: json['name'] as String? ?? 'Unknown Course',
      code: json['code'] as String?,
      academicYear: json['academic_year'] as String?,
      academicSemester: json['academic_semester'] as String?,
      userGroupName: userGroupName ?? json['user_group_name'] as String?,
      institutionUsers: rawInstitutionUsers
          .whereType<Map<dynamic, dynamic>>()
          .map(
            (value) =>
                CourseInstitutionUser.fromJson(value.cast<String, dynamic>()),
          )
          .toList(),
    );
  }
  final int id;
  final String name;
  final String? code;
  final String? academicYear;
  final String? academicSemester;
  final String? userGroupName;
  final List<CourseInstitutionUser> institutionUsers;

  String get safeId =>
      (code != null && code!.trim().isNotEmpty) ? code!.trim() : id.toString();

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'code': code,
    'academic_year': academicYear,
    'academic_semester': academicSemester,
    'user_group_name': userGroupName,
  };
}

class CourseInstitutionUser {

  const CourseInstitutionUser({
    required this.pivot, this.firstName,
    this.lastName,
  });

  factory CourseInstitutionUser.fromJson(Map<String, dynamic> json) {
    return CourseInstitutionUser(
      firstName: json['first_name'] as String?,
      lastName: json['last_name'] as String?,
      pivot: CourseInstitutionUserPivot.fromJson(
        (json['pivot'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>() ??
            const <String, dynamic>{},
      ),
    );
  }
  final String? firstName;
  final String? lastName;
  final CourseInstitutionUserPivot pivot;
}

class CourseInstitutionUserPivot {

  const CourseInstitutionUserPivot({required this.courseroleId});

  factory CourseInstitutionUserPivot.fromJson(Map<String, dynamic> json) {
    return CourseInstitutionUserPivot(
      courseroleId: _toInt(json['courserole_id']) ?? 0,
    );
  }
  final int courseroleId;
}

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
