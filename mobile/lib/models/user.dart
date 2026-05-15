import 'package:flutter/foundation.dart';

@immutable
class UserProfile {
  const UserProfile({
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.email,
    this.phone,
    this.birthDate,
    this.gender,
    this.lastSyncedAt,
    this.currentSemester,
    this.currentYear,
    this.createdAt,
    this.ezygoCreatedAt,
    this.classField,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    String? createdAt;
    final rawCreated = json['created_at'];
    if (rawCreated is String) {
      createdAt = rawCreated;
    } else if (rawCreated is num) {
      final ms = rawCreated < 100000000000
          ? (rawCreated * 1000).toInt()
          : rawCreated.toInt();
      createdAt = DateTime.fromMillisecondsSinceEpoch(ms).toIso8601String();
    }

    String? ezygoCreatedAt;
    final rawEzygoCreated = json['ezygo_created_at'];
    if (rawEzygoCreated is String) {
      ezygoCreatedAt = rawEzygoCreated;
    }

    return UserProfile(
      firstName: json['first_name'] as String?,
      lastName: json['last_name'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      birthDate: json['birth_date'] as String?,
      gender: json['gender'] as String?,
      lastSyncedAt: json['last_synced_at'] as String?,
      currentSemester: json['current_semester'] as String?,
      currentYear: json['current_year'] as String?,
      createdAt: createdAt,
      ezygoCreatedAt: ezygoCreatedAt,
      classField: json['class'] != null
          ? (json['class'] is Map<dynamic, dynamic>
                ? UserClass.fromJson(json['class'] as Map<String, dynamic>)
                : UserClass(id: '', name: json['class'].toString()))
          : null,
    );
  }
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String? email;
  final String? phone;
  final String? birthDate;
  final String? gender;
  final String? lastSyncedAt;
  final String? currentSemester;
  final String? currentYear;
  final String? createdAt;
  final String? ezygoCreatedAt;
  final UserClass? classField;

  String? get fullName {
    if (firstName == null && lastName == null) return null;
    return '${firstName ?? ''} ${lastName ?? ''}'.trim();
  }

  UserProfile copyWith({
    String? firstName,
    String? lastName,
    String? avatarUrl,
    String? email,
    String? phone,
    String? birthDate,
    String? gender,
    String? lastSyncedAt,
    String? currentSemester,
    String? currentYear,
    String? createdAt,
    String? ezygoCreatedAt,
    UserClass? classField,
  }) {
    return UserProfile(
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      currentSemester: currentSemester ?? this.currentSemester,
      currentYear: currentYear ?? this.currentYear,
      createdAt: createdAt ?? this.createdAt,
      ezygoCreatedAt: ezygoCreatedAt ?? this.ezygoCreatedAt,
      classField: classField ?? this.classField,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserProfile &&
          runtimeType == other.runtimeType &&
          firstName == other.firstName &&
          lastName == other.lastName &&
          avatarUrl == other.avatarUrl &&
          email == other.email &&
          phone == other.phone &&
          birthDate == other.birthDate &&
          gender == other.gender &&
          lastSyncedAt == other.lastSyncedAt &&
          currentSemester == other.currentSemester &&
          currentYear == other.currentYear &&
          createdAt == other.createdAt &&
          ezygoCreatedAt == other.ezygoCreatedAt &&
          classField == other.classField;

  @override
  int get hashCode =>
      firstName.hashCode ^
      lastName.hashCode ^
      avatarUrl.hashCode ^
      email.hashCode ^
      phone.hashCode ^
      birthDate.hashCode ^
      gender.hashCode ^
      lastSyncedAt.hashCode ^
      currentSemester.hashCode ^
      currentYear.hashCode ^
      createdAt.hashCode ^
      ezygoCreatedAt.hashCode ^
      classField.hashCode;

  Map<String, dynamic> toJson() => {
    'first_name': firstName,
    'last_name': lastName,
    'avatar_url': avatarUrl,
    'email': email,
    'phone': phone,
    'birth_date': birthDate,
    'gender': gender,
    'last_synced_at': lastSyncedAt,
    'current_semester': currentSemester,
    'current_year': currentYear,
    'created_at': createdAt,
    'ezygo_created_at': ezygoCreatedAt,
    'class': classField?.toJson(),
  };
}

class UserClass {
  UserClass({required this.id, required this.name});

  factory UserClass.fromJson(Map<String, dynamic> json) => UserClass(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? 'Unknown Class',
  );
  final String id;
  final String name;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
  };
}

@immutable
class UserSettings {
  const UserSettings({
    required this.bunkCalculatorEnabled,
    required this.targetPercentage,
    required this.disabledCourses,
    this.semester,
    this.academicYear,
  });

  factory UserSettings.defaults() => const UserSettings(
    bunkCalculatorEnabled: true,
    targetPercentage: 75,
    disabledCourses: {},
  );

  factory UserSettings.fromJson(Map<String, dynamic> json) {
    // Parse nested map safely
    final rawDisabledSource = json['disabled_courses'];
    final rawDisabled = rawDisabledSource is Map
        ? Map<String, dynamic>.from(rawDisabledSource)
        : <String, dynamic>{};
    final disabled = <String, Map<String, String>>{};

    rawDisabled.forEach((semester, courses) {
      if (courses is Map<String, dynamic>) {
        disabled[semester] = courses.map(
          (key, value) => MapEntry(key, value.toString()),
        );
      }
    });

    return UserSettings(
      bunkCalculatorEnabled: json['bunk_calculator_enabled'] as bool? ?? true,
      targetPercentage: (json['target_percentage'] as num?)?.toInt() ?? 75,
      semester: json['semester'] as String?,
      academicYear: json['academic_year'] as String?,
      disabledCourses: disabled,
    );
  }
  final bool bunkCalculatorEnabled;
  final int targetPercentage;
  final String? semester;
  final String? academicYear;
  final Map<String, Map<String, String>> disabledCourses;

  UserSettings copyWith({
    bool? bunkCalculatorEnabled,
    int? targetPercentage,
    String? semester,
    String? academicYear,
    Map<String, Map<String, String>>? disabledCourses,
  }) {
    return UserSettings(
      bunkCalculatorEnabled:
          bunkCalculatorEnabled ?? this.bunkCalculatorEnabled,
      targetPercentage: targetPercentage ?? this.targetPercentage,
      semester: semester ?? this.semester,
      academicYear: academicYear ?? this.academicYear,
      disabledCourses: disabledCourses ?? this.disabledCourses,
    );
  }

  int get disabledCount {
    var count = 0;
    disabledCourses.forEach((_, courses) => count += courses.length);
    return count;
  }

  /// Returns a list of unique course codes that are disabled in any semester
  List<String> get flatDisabledCourses {
    final courses = <String>{};
    for (final semester in disabledCourses.values) {
      courses.addAll(semester.keys);
    }
    return courses.toList()..sort();
  }

  Map<String, dynamic> toJson() => {
    'bunk_calculator_enabled': bunkCalculatorEnabled,
    'target_percentage': targetPercentage,
    'semester': semester,
    'academic_year': academicYear,
    'disabled_courses': disabledCourses,
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserSettings &&
          runtimeType == other.runtimeType &&
          bunkCalculatorEnabled == other.bunkCalculatorEnabled &&
          targetPercentage == other.targetPercentage &&
          semester == other.semester &&
          academicYear == other.academicYear &&
          _mapsEqual(disabledCourses, other.disabledCourses);

  @override
  int get hashCode =>
      bunkCalculatorEnabled.hashCode ^
      targetPercentage.hashCode ^
      semester.hashCode ^
      academicYear.hashCode ^
      disabledCourses.hashCode;

  bool _mapsEqual(Map<dynamic, dynamic> m1, Map<dynamic, dynamic> m2) {
    if (m1.length != m2.length) return false;
    for (final key in m1.keys) {
      if (!m2.containsKey(key) || m1[key] != m2[key]) {
        // Nested map check for disabledCourses
        if (m1[key] is Map<dynamic, dynamic> &&
            m2[key] is Map<dynamic, dynamic>) {
          if (!_mapsEqual(
            m1[key] as Map<dynamic, dynamic>,
            m2[key] as Map<dynamic, dynamic>,
          )) {
            return false;
          }
        } else {
          return false;
        }
      }
    }
    return true;
  }
}

class StealthInfo {
  // Formatted for header

  StealthInfo({
    required this.browserName,
    required this.browserVersion,
    required this.userAgent,
    required this.secChUa,
  });

  factory StealthInfo.fromJson(Map<String, dynamic> json) => StealthInfo(
    browserName: json['browserName'] as String,
    browserVersion: json['browserVersion'] as String,
    userAgent: json['userAgent'] as String,
    secChUa: json['secChUa'] as String,
  );
  final String browserName; // e.g., "Chrome", "Edge"
  final String browserVersion; // e.g., "148.0.0.0"
  final String userAgent; // FULL Generated UA
  final String secChUa;

  Map<String, dynamic> toJson() => {
    'browserName': browserName,
    'browserVersion': browserVersion,
    'userAgent': userAgent,
    'secChUa': secChUa,
  };
}
