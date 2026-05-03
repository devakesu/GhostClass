import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ghostclass/services/logger.dart';

/// Keys for all secure storage entries.
/// Centralised here so key names never drift across the codebase.
abstract final class _Keys {
  static const ezygoToken = 'ezygo_token';
  static const supabaseUserId = 'supabase_user_id';
  static const ezygoUserId = 'ezygo_user_id';
  static const username = 'username';
  static const settings = 'user_settings';
  static const profile = 'user_profile';
  static const termsVersion = 'terms_version';
  static const stealthInfo = 'browser_stealth_info';
}

/// Wraps [FlutterSecureStorage] with typed helpers.
///
/// All values are encrypted at rest via AES on Android (Keystore) and
/// Keychain on iOS/macOS — no plaintext is ever written to disk.
class SecureStorageService {
  final FlutterSecureStorage _storage;
  
  @visibleForTesting
  FlutterSecureStorage get storage => _storage;

  SecureStorageService([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage(
          aOptions: AndroidOptions(
            keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
            storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
            migrateOnAlgorithmChange: true,
          ),
          iOptions: IOSOptions(
            accessibility: KeychainAccessibility.first_unlock,
          ),
        );

  // ─── EzyGo Token ─────────────────────────────────────────────────────────

  Future<void> saveEzygoToken(String token) =>
      _storage.write(key: _Keys.ezygoToken, value: token);

  Future<String?> getEzygoToken() =>
      _storage.read(key: _Keys.ezygoToken);

  Future<void> clearEzygoToken() =>
      _storage.delete(key: _Keys.ezygoToken);

  // ─── Supabase User ID ────────────────────────────────────────────────────

  Future<void> saveSupabaseUserId(String id) =>
      _storage.write(key: _Keys.supabaseUserId, value: id);

  Future<String?> getSupabaseUserId() =>
      _storage.read(key: _Keys.supabaseUserId);

  // ─── EzyGo User ID & Username ────────────────────────────────────────────

  Future<void> saveEzygoUserId(String id) =>
      _storage.write(key: _Keys.ezygoUserId, value: id);

  Future<String?> getEzygoUserId() =>
      _storage.read(key: _Keys.ezygoUserId);

  Future<void> saveUsername(String username) =>
      _storage.write(key: _Keys.username, value: username);

  Future<String?> getUsername() =>
      _storage.read(key: _Keys.username);

  // ─── User Profile ────────────────────────────────────────────────────────

  Future<void> saveUserProfile(UserProfile profile) =>
      _storage.write(key: _Keys.profile, value: jsonEncode(profile.toJson()));

  Future<UserProfile?> getUserProfile() async {
    final raw = await _storage.read(key: _Keys.profile);
    if (raw == null) return null;
    try {
      final Map<String, dynamic> data = jsonDecode(raw) as Map<String, dynamic>;
      // Backwards compatibility for old profile structure if needed, 
      // but here we just rely on fromJson
      return UserProfile.fromJson(data);
    } catch (e) {
      AppLogger.e('SecureStorage: Error decoding profile', e);
      return null;
    }
  }

  // ─── User Settings ───────────────────────────────────────────────────────

  /// Persists user settings as a JSON blob.
  Future<void> saveSettings(UserSettings settings) =>
      _storage.write(key: _Keys.settings, value: jsonEncode(settings.toJson()));

  /// Returns [null] if no settings have been saved yet.
  Future<UserSettings?> getSettings() async {
    final raw = await _storage.read(key: _Keys.settings);
    if (raw == null) return null;
    try {
      return UserSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (e, st) {
      AppLogger.e('SecureStorage: Error decoding settings', e, st);
      return null;
    }
  }

  // ─── Terms Acceptance ───────────────────────────────────────────────────

  Future<void> saveTermsVersion(String version) =>
      _storage.write(key: _Keys.termsVersion, value: version);

  Future<String?> getTermsVersion() =>
      _storage.read(key: _Keys.termsVersion);

  // ─── Browser Stealth Info ───────────────────────────────────────────────

  Future<void> saveStealthInfo(StealthInfo info) =>
      _storage.write(key: _Keys.stealthInfo, value: jsonEncode(info.toJson()));

  Future<StealthInfo?> getStealthInfo() async {
    final raw = await _storage.read(key: _Keys.stealthInfo);
    if (raw == null) return null;
    try {
      return StealthInfo.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (e, st) {
      AppLogger.e('SecureStorage: Error decoding stealth info', e, st);
      return null;
    }
  }

  // ─── Full Clear ──────────────────────────────────────────────────────────

  /// Deletes every key managed by this service. Should be called on logout.
  Future<void> clearAll() => _storage.deleteAll();
}

// ─── User Models ─────────────────────────────────────────────────────────────

class UserProfile {
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


  UserProfile({
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


  factory UserProfile.fromJson(Map<String, dynamic> json) {
    String? createdAt;
    final rawCreated = json['created_at'];
    if (rawCreated is String) {
      createdAt = rawCreated;
    } else if (rawCreated is num) {
      final ms = rawCreated < 100000000000 ? (rawCreated * 1000).toInt() : rawCreated.toInt();
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
      classField: json['class'] != null ? UserClass.fromJson(json['class'] as Map<String, dynamic>) : null,
    );
  }


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
  final String id;
  final String name;

  UserClass({required this.id, required this.name});

  factory UserClass.fromJson(Map<String, dynamic> json) => UserClass(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Unknown Class',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
      };
}

class UserSettings {
  final bool bunkCalculatorEnabled;
   final int targetPercentage;
  final String? semester;
  final String? academicYear;
  final Map<String, Map<String, String>> disabledCourses;
  final Map<String, String> courseCatalog;

  const UserSettings({
    required this.bunkCalculatorEnabled,
    required this.targetPercentage,
    required this.disabledCourses, required this.courseCatalog, this.semester,
    this.academicYear,
  });

  factory UserSettings.defaults() => const UserSettings(
        bunkCalculatorEnabled: true,
        targetPercentage: 75,
        semester: null,
        academicYear: null,
        disabledCourses: {},
        courseCatalog: {},
      );

  UserSettings copyWith({
    bool? bunkCalculatorEnabled,
    int? targetPercentage,
    String? semester,
    String? academicYear,
    Map<String, Map<String, String>>? disabledCourses,
    Map<String, String>? courseCatalog,
  }) {
    return UserSettings(
      bunkCalculatorEnabled:
          bunkCalculatorEnabled ?? this.bunkCalculatorEnabled,
      targetPercentage: targetPercentage ?? this.targetPercentage,
      semester: semester ?? this.semester,
      academicYear: academicYear ?? this.academicYear,
      disabledCourses: disabledCourses ?? this.disabledCourses,
      courseCatalog: courseCatalog ?? this.courseCatalog,
    );
  }

  int get disabledCount {
    int count = 0;
    disabledCourses.forEach((_, courses) => count += courses.length);
    return count;
  }

  /// Returns a list of unique course codes that are disabled in any semester
  List<String> get flatDisabledCourses {
    final Set<String> courses = {};
    for (final semester in disabledCourses.values) {
      courses.addAll(semester.keys);
    }
    return courses.toList()..sort();
  }

  factory UserSettings.fromJson(Map<String, dynamic> json) {
    // Parse nested map safely
    final rawDisabled = json['disabled_courses'] as Map<String, dynamic>? ?? {};
    final Map<String, Map<String, String>> disabled = {};

    rawDisabled.forEach((semester, courses) {
      if (courses is Map<String, dynamic>) {
        disabled[semester] = courses.map(
          (key, value) => MapEntry(key.toString(), value.toString()),
        );
      }
    });

    return UserSettings(
      bunkCalculatorEnabled: json['bunk_calculator_enabled'] as bool? ?? true,
      targetPercentage: (json['target_percentage'] as num?)?.toInt() ?? 75,
      semester: json['semester'] as String?,
      academicYear: json['academic_year'] as String?,
      disabledCourses: disabled,
      courseCatalog: (json['course_catalog'] as Map<String, dynamic>?)?.map(
            (key, value) {
              String name;
              if (value is Map && value.containsKey('name')) {
                name = value['name'].toString();
              } else {
                name = value.toString();
              }
              return MapEntry(key.toString(), name);
            },
          ) ??
          {},
    );
  }

  Map<String, dynamic> toJson() => {
        'bunk_calculator_enabled': bunkCalculatorEnabled,
        'target_percentage': targetPercentage,
        'semester': semester,
        'academic_year': academicYear,
        'disabled_courses': disabledCourses,
        'course_catalog': courseCatalog,
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
          _mapsEqual(disabledCourses, other.disabledCourses) &&
          _mapsEqual(courseCatalog, other.courseCatalog);

  @override
  int get hashCode =>
      bunkCalculatorEnabled.hashCode ^
      targetPercentage.hashCode ^
      semester.hashCode ^
      academicYear.hashCode ^
      disabledCourses.hashCode ^
      courseCatalog.hashCode;

  bool _mapsEqual(Map m1, Map m2) {
    if (m1.length != m2.length) return false;
    for (final key in m1.keys) {
      if (!m2.containsKey(key) || m1[key] != m2[key]) {
        // Nested map check for disabledCourses
        if (m1[key] is Map && m2[key] is Map) {
          if (!_mapsEqual(m1[key] as Map, m2[key] as Map)) return false;
        } else {
          return false;
        }
      }
    }
    return true;
  }
}

class StealthInfo {
  final String browserName; // e.g., "Chrome", "Edge"
  final String browserVersion; // e.g., "148.0.0.0"
  final String userAgent; // FULL Generated UA
  final String secChUa; // Formatted for header

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

  Map<String, dynamic> toJson() => {
        'browserName': browserName,
        'browserVersion': browserVersion,
        'userAgent': userAgent,
        'secChUa': secChUa,
      };
}

final secureStorageProvider = Provider<SecureStorageService>((ref) => SecureStorageService());
