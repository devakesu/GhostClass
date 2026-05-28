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
  static const attestationResult = 'attestation_result';
}

/// Wraps [FlutterSecureStorage] with typed helpers.
///
/// All values are encrypted at rest via AES on Android (Keystore) and
/// Keychain on iOS/macOS — no plaintext is ever written to disk.
class SecureStorageService {
  SecureStorageService([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock,
            ),
          );
  final FlutterSecureStorage _storage;

  @visibleForTesting
  FlutterSecureStorage get storage => _storage;

  // ─── Safe Storage Helpers ──────────────────────────────────────────────────

  Future<void> _safeWrite({required String key, required String value}) async {
    try {
      await _storage.write(key: key, value: value);
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Error during write of key: $key', e, st);
      await _selfHeal(e);
      rethrow;
    }
  }

  Future<String?> _safeRead({required String key}) async {
    try {
      return await _storage.read(key: key);
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Error during read of key: $key', e, st);
      await _selfHeal(e);
      return null;
    }
  }

  Future<void> _safeDelete({required String key}) async {
    try {
      await _storage.delete(key: key);
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Error during delete of key: $key', e, st);
      await _selfHeal(e);
      rethrow;
    }
  }

  Future<void> _safeDeleteAll() async {
    try {
      await _storage.deleteAll();
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Error during deleteAll', e, st);
      // If deleteAll fails, we can't do much, but we still catch to avoid crashing
    }
  }

  Future<void> _selfHeal(Object error) async {
    AppLogger.e(
      'SecureStorage: Executing self-healing routine due to exception: $error',
    );
    try {
      await _storage.deleteAll();
    } on Object catch (e, st) {
      AppLogger.e('SecureStorage: Self-healing deleteAll failed', e, st);
    }
  }

  // ─── EzyGo Token ─────────────────────────────────────────────────────────

  Future<void> saveEzygoToken(String token) => token.trim().isEmpty
      ? _safeDelete(key: _Keys.ezygoToken)
      : _safeWrite(key: _Keys.ezygoToken, value: token);

  Future<String?> getEzygoToken() => _safeRead(key: _Keys.ezygoToken);

  /// Return `null` if the stored token is missing or empty to avoid callers
  /// accidentally treating an empty string as a valid token.
  Future<String?> getNormalizedEzygoToken() async {
    final raw = await _safeRead(key: _Keys.ezygoToken);
    if (raw == null) return null;
    final t = raw.trim();
    return t.isEmpty ? null : t;
  }

  Future<void> clearEzygoToken() => _safeDelete(key: _Keys.ezygoToken);

  // ─── FCM Token ───────────────────────────────────────────────────────────

  Future<void> saveFcmToken(String token) => token.trim().isEmpty
      ? _safeDelete(key: _Keys.fcmToken)
      : _safeWrite(key: _Keys.fcmToken, value: token);

  Future<String?> getFcmToken() => _safeRead(key: _Keys.fcmToken);

  Future<String?> getNormalizedFcmToken() async {
    final raw = await _safeRead(key: _Keys.fcmToken);
    if (raw == null) return null;
    final t = raw.trim();
    return t.isEmpty ? null : t;
  }

  // ─── Supabase User ID ────────────────────────────────────────────────────

  Future<void> saveSupabaseUserId(String id) =>
      _safeWrite(key: _Keys.supabaseUserId, value: id);

  Future<String?> getSupabaseUserId() => _safeRead(key: _Keys.supabaseUserId);

  // ─── EzyGo User ID & Username ────────────────────────────────────────────

  Future<void> saveEzygoUserId(String id) =>
      _safeWrite(key: _Keys.ezygoUserId, value: id);

  Future<String?> getEzygoUserId() => _safeRead(key: _Keys.ezygoUserId);

  Future<void> saveUsername(String username) =>
      _safeWrite(key: _Keys.username, value: username);

  Future<String?> getUsername() => _safeRead(key: _Keys.username);

  // ─── User Profile ────────────────────────────────────────────────────────

  Future<void> saveUserProfile(UserProfile profile) =>
      _safeWrite(key: _Keys.profile, value: jsonEncode(profile.toJson()));

  Future<UserProfile?> getUserProfile() async {
    final raw = await _safeRead(key: _Keys.profile);
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
      _safeWrite(key: _Keys.settings, value: jsonEncode(settings.toJson()));

  /// Returns `null` if no settings have been saved yet.
  Future<UserSettings?> getSettings() async {
    final raw = await _safeRead(key: _Keys.settings);
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
      _safeWrite(key: _Keys.termsVersion, value: version);

  Future<String?> getTermsVersion() => _safeRead(key: _Keys.termsVersion);

  // ─── Browser Stealth Info ───────────────────────────────────────────────

  Future<void> saveStealthInfo(StealthInfo info) =>
      _safeWrite(key: _Keys.stealthInfo, value: jsonEncode(info.toJson()));

  Future<StealthInfo?> getStealthInfo() async {
    final raw = await _safeRead(key: _Keys.stealthInfo);
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
  Future<void> saveCachedData(
    String key,
    dynamic data, {
    Duration ttl = const Duration(hours: 24),
  }) async {
    final expiry = DateTime.now().add(ttl).millisecondsSinceEpoch;
    final payload = {
      'data': data,
      'expiry': expiry,
    };
    await _safeWrite(key: 'cache_$key', value: jsonEncode(payload));
  }

  /// Returns cached data if it exists and has not expired.
  Future<dynamic> getCachedData(String key) async {
    final raw = await _safeRead(key: 'cache_$key');
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final expiry = decoded['expiry'] as int;
      if (DateTime.now().millisecondsSinceEpoch > expiry) {
        await _safeDelete(key: 'cache_$key');
        return null;
      }
      return decoded['data'];
    } on Object {
      AppLogger.e('SecureStorage: Error decoding cache for $key');
      return null;
    }
  }

  // ─── Academic State ───────────────────────────────────────────────────────

  Future<void> saveAcademicState(AcademicState state) => _safeWrite(
    key: _Keys.academicState,
    value: jsonEncode({'semester': state.semester, 'year': state.year}),
  );

  Future<AcademicState?> getAcademicState() async {
    final raw = await _safeRead(key: _Keys.academicState);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return AcademicState(
        semester: decoded['semester'] as String,
        year: decoded['year'] as String,
      );
    } on Object {
      AppLogger.e('SecureStorage: Error decoding academic state');
      return null;
    }
  }

  // ─── Attestation Result ──────────────────────────────────────────────────

  Future<void> saveAttestationResult(String resultJson) =>
      _safeWrite(key: _Keys.attestationResult, value: resultJson);

  Future<String?> getAttestationResult() =>
      _safeRead(key: _Keys.attestationResult);

  Future<void> clearAttestationResult() =>
      _safeDelete(key: _Keys.attestationResult);

  // ─── Generic Read/Write (Safe access to _storage) ──────────────────────

  Future<void> writeSecure(String key, String value) =>
      _safeWrite(key: key, value: value);

  Future<String?> readSecure(String key) => _safeRead(key: key);

  Future<void> deleteSecure(String key) => _safeDelete(key: key);

  Future<void> deleteCachedData(String key) => _safeDelete(key: 'cache_$key');

  // ─── Full Clear ──────────────────────────────────────────────────────────

  /// Deletes every key managed by this service. Should be called on logout.
  Future<void> clearAll() => _safeDeleteAll();

  /// Deletes all cached keys starting with "cache_" from secure storage.
  Future<void> clearAllCachedData() async {
    try {
      final all = await _storage.readAll();
      for (final key in all.keys) {
        if (key.startsWith('cache_')) {
          await _safeDelete(key: key);
        }
      }
    } on Object catch (e) {
      AppLogger.e('SecureStorage: Error clearing cached data', e);
    }
  }
}

final secureStorageProvider = Provider<SecureStorageService>(
  (ref) => SecureStorageService(),
);
