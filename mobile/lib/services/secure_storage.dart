import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
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
  static const academicState = 'academic_state';
  static const fcmToken = 'fcm_token';
}

/// Wraps [FlutterSecureStorage] with typed helpers.
///
/// All values are encrypted at rest via AES on Android (Keystore) and
/// Keychain on iOS/macOS — no plaintext is ever written to disk.
class SecureStorageService {

  SecureStorageService([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage(
          iOptions: IOSOptions(
            accessibility: KeychainAccessibility.first_unlock,
          ),
        );
  final FlutterSecureStorage _storage;
  
  @visibleForTesting
  FlutterSecureStorage get storage => _storage;

  // ─── EzyGo Token ─────────────────────────────────────────────────────────

  Future<void> saveEzygoToken(String token) =>
      _storage.write(key: _Keys.ezygoToken, value: token);

  Future<String?> getEzygoToken() =>
      _storage.read(key: _Keys.ezygoToken);

  Future<void> clearEzygoToken() =>
      _storage.delete(key: _Keys.ezygoToken);

  // ─── FCM Token ───────────────────────────────────────────────────────────

  Future<void> saveFcmToken(String token) =>
      _storage.write(key: _Keys.fcmToken, value: token);

  Future<String?> getFcmToken() =>
      _storage.read(key: _Keys.fcmToken);

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
      final data = jsonDecode(raw) as Map<String, dynamic>;
      // Backwards compatibility for old profile structure if needed, 
      // but here we just rely on fromJson
      return UserProfile.fromJson(data);
    } on Object catch (e) {
      AppLogger.e('SecureStorage: Error decoding profile', e);
      return null;
    }
  }

  // ─── User Settings ───────────────────────────────────────────────────────

  /// Persists user settings as a JSON blob.
  Future<void> saveSettings(UserSettings settings) =>
      _storage.write(key: _Keys.settings, value: jsonEncode(settings.toJson()));

  /// Returns `null` if no settings have been saved yet.
  Future<UserSettings?> getSettings() async {
    final raw = await _storage.read(key: _Keys.settings);
    if (raw == null) return null;
    try {
      return UserSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on Object catch (e, st) {
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
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Error decoding stealth info', e, st);
      return null;
    }
  }

  // ─── Generic TTL Cache ──────────────────────────────────────────────────

  /// Persists any JSON-serializable data with a TTL.
  Future<void> saveCachedData(String key, dynamic data, {Duration ttl = const Duration(hours: 24)}) async {
    final expiry = DateTime.now().add(ttl).millisecondsSinceEpoch;
    final payload = {
      'data': data,
      'expiry': expiry,
    };
    await _storage.write(key: 'cache_$key', value: jsonEncode(payload));
  }

  /// Returns cached data if it exists and has not expired.
  Future<dynamic> getCachedData(String key) async {
    final raw = await _storage.read(key: 'cache_$key');
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final expiry = decoded['expiry'] as int;
      if (DateTime.now().millisecondsSinceEpoch > expiry) {
        await _storage.delete(key: 'cache_$key');
        return null;
      }
      return decoded['data'];
    } on Object {
      AppLogger.w('SecureStorage: Error decoding cache for $key');
      return null;
    }
  }

  // ─── Academic State ───────────────────────────────────────────────────────
  
  Future<void> saveAcademicState(AcademicState state) =>
      _storage.write(key: _Keys.academicState, value: jsonEncode({'semester': state.semester, 'year': state.year}));

  Future<AcademicState?> getAcademicState() async {
    final raw = await _storage.read(key: _Keys.academicState);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return AcademicState(
        semester: decoded['semester'] as String,
        year: decoded['year'] as String,
      );
    } on Object {
      AppLogger.w('SecureStorage: Error decoding academic state');
      return null;
    }
  }

  // ─── Full Clear ──────────────────────────────────────────────────────────

  /// Deletes every key managed by this service. Should be called on logout.
  Future<void> clearAll() => _storage.deleteAll();
}

final secureStorageProvider = Provider<SecureStorageService>((ref) => SecureStorageService());
