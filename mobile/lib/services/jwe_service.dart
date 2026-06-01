import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
// Preserved for potential platform-specific overrides
// ignore: unnecessary_import
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:jose/jose.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// JweService
/// ----------
/// Handles Bi-directional End-to-End Encryption (E2EE) for GhostClass.
class JweService {
  JweService._internal() {
    const networkTimeout = kDebugMode
        ? Duration(seconds: 45)
        : Duration(seconds: 30);

    _dio = Dio(
      BaseOptions(
        connectTimeout: networkTimeout,
        receiveTimeout: networkTimeout,
        sendTimeout: networkTimeout,
      ),
    );

    if (kDebugMode) {
      (_dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
        return HttpClient()
          ..badCertificateCallback = NetworkUtils.validateCertificateHostname;
      };
    }
  }
  static final JweService _instance = JweService._internal();
  static JweService get instance => _instance;

  late final Dio _dio;

  JsonWebKeySet? _cachedJwks;
  DateTime? _lastFetch;

  final String _ghostclassApiUrl = AppConfig.ghostclassApiUrl;

  /// No longer needed internally, delegated to NetworkUtils.

  Future<void>? _inFlightFetch;
  static const String _jwksCacheKey = 'ghostclass_jwks_cache';
  static const String _jwksTimeKey = 'ghostclass_jwks_time';

  Future<void> _fetchJwks() async {
    // 1. In-memory cache check (1 hour)
    if (_cachedJwks != null &&
        _lastFetch != null &&
        DateTime.now().difference(_lastFetch!).inHours < 1) {
      return;
    }

    // 2. Return in-flight fetch if exists to deduplicate concurrent calls
    if (_inFlightFetch != null) {
      return _inFlightFetch!;
    }

    _inFlightFetch = _performFetch();
    try {
      await _inFlightFetch;
    } finally {
      _inFlightFetch = null;
    }
  }

  Future<void> _performFetch() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // 3. Persistent cache check
      final cachedJson = prefs.getString(_jwksCacheKey);
      final cachedTimeStr = prefs.getString(_jwksTimeKey);
      if (cachedJson != null && cachedTimeStr != null) {
        try {
          final cachedTime = DateTime.parse(cachedTimeStr);
          _cachedJwks = JsonWebKeySet.fromJson(
            json.decode(cachedJson) as Map<String, dynamic>,
          );
          _lastFetch = cachedTime;
          AppLogger.d('JweService: Loaded JWKS from persistent cache.');

          // Stale-While-Revalidate: if cached keys are older than 24 hours,
          // refresh from network in the background without blocking startup.
          if (DateTime.now().difference(cachedTime).inHours >= 24) {
            AppLogger.safeUnawait(
              _refreshJwksFromNetwork(prefs).catchError(
                (Object e, StackTrace st) => AppLogger.e(
                  'JweService: Background JWKS refresh failed',
                  e,
                  st,
                ),
              ),
              'JweService: background JWKS refresh',
            );
          }
          return;
        } on Object catch (e) {
          AppLogger.e('JweService: Failed to parse cached JWKS time', e);
        }
      }

      // 4. Cache miss: Blocking network fetch
      await _refreshJwksFromNetwork(prefs);
    } on Object catch (e) {
      AppLogger.e('JweService: JWKS Fetch Error', e);
      rethrow;
    }
  }

  Future<void> _refreshJwksFromNetwork(SharedPreferences prefs) async {
    try {
      final url = '$_ghostclassApiUrl/.well-known/jwks.json';
      final response = await _dio.get<dynamic>(url);

      if (response.statusCode == 200) {
        final data = response.data;
        _cachedJwks = JsonWebKeySet.fromJson(data as Map<String, dynamic>);
        _lastFetch = DateTime.now();

        // Update persistent cache
        await prefs.setString(_jwksCacheKey, json.encode(data));
        await prefs.setString(_jwksTimeKey, _lastFetch!.toIso8601String());

        AppLogger.i('JweService: Fetched server JWKS successfully.');
      } else {
        throw Exception('Failed to fetch JWKS: ${response.statusCode}');
      }
    } on Object catch (e) {
      AppLogger.e('JweService: Failed to refresh JWKS from network', e);
      // If we already have a cached copy, don't bubble up background errors
      if (_cachedJwks == null) {
        rethrow;
      }
    }
  }

  Future<void> preWarm() async {
    try {
      await _fetchJwks();
    } on Object catch (e) {
      AppLogger.d('JweService: Pre-warm skipped.', e);
    }
  }

  /// Selects a usable server key from JWKS.
  ///
  /// Prefer a key with a kid so the resulting JWE preserves key-rotation hints.
  JsonWebKey _getPreferredServerKey() {
    final keys = _cachedJwks?.keys ?? const <JsonWebKey>[];
    if (keys.isEmpty) {
      throw Exception('Server public key not available.');
    }

    return keys.firstWhere(
      (key) => key.keyId != null && key.keyId!.isNotEmpty,
      orElse: () => keys.first,
    );
  }

  /// Forces the JsonWebKey to explicitly support wrapKey while preserving kid.
  JsonWebKey _getSanitizedServerKey(JsonWebKey key) {
    final rawJson = key.toJson();

    // Ensure the server key has the required RSA parameters. If the server
    // provides an unexpected key shape, fail fast instead of constructing a
    // potentially invalid JWK which could cause subtle crypto errors later.
    final n = rawJson['n'] as String?;
    final e = rawJson['e'] as String?;
    if (n == null || n.isEmpty || e == null || e.isEmpty) {
      throw Exception('Server JWK missing RSA modulus or exponent.');
    }

    return JsonWebKey.fromJson({
      'kty': 'RSA',
      'n': n,
      'e': e,
      if (rawJson['kid'] != null) 'kid': rawJson['kid'],
      // Notice: We deliberately omit 'alg', 'use', and 'key_ops' to avoid
      // rejecting the key for operation mismatches while preserving the kid.
    });
  }

  Future<({String jwe, String rcek})> encryptRequest(
    Map<String, dynamic> data,
  ) async {
    await _fetchJwks();

    if (_cachedJwks == null || _cachedJwks!.keys.isEmpty) {
      throw Exception('Server public key not available.');
    }

    final random = Random.secure();
    final rcekBytes = Uint8List.fromList(
      List.generate(32, (_) => random.nextInt(256)),
    );
    final rcekBase64 = base64Url.encode(rcekBytes).replaceAll('=', '');

    final enrichedData = {...data, 'rcek': rcekBase64};

    // Use the sanitized key while preserving kid for rotation-aware servers
    final serverKey = _getSanitizedServerKey(_getPreferredServerKey());

    final builder = JsonWebEncryptionBuilder()
      ..jsonContent = enrichedData
      ..encryptionAlgorithm = 'A256GCM'
      ..addRecipient(serverKey, algorithm: 'RSA-OAEP-256');

    final jwe = builder.build().toCompactSerialization();

    return (jwe: jwe, rcek: rcekBase64);
  }

  Future<({String jwe, String rcek})> encryptHeaderKey() async {
    await _fetchJwks();

    if (_cachedJwks == null || _cachedJwks!.keys.isEmpty) {
      throw Exception('Server public key not available.');
    }

    final random = Random.secure();
    final rcekBytes = Uint8List.fromList(
      List.generate(32, (_) => random.nextInt(256)),
    );
    final rcekBase64 = base64Url.encode(rcekBytes).replaceAll('=', '');

    // Use the sanitized key while preserving kid for rotation-aware servers
    final serverKey = _getSanitizedServerKey(_getPreferredServerKey());

    final builder = JsonWebEncryptionBuilder()
      ..jsonContent = {'rcek': rcekBase64}
      ..encryptionAlgorithm = 'A256GCM'
      ..addRecipient(serverKey, algorithm: 'RSA-OAEP-256');

    return (jwe: builder.build().toCompactSerialization(), rcek: rcekBase64);
  }

  Future<dynamic> decryptResponse(String jwe, String rcekBase64) async {
    try {
      final rcekBytes = base64Url.decode(base64.normalize(rcekBase64));

      final jwk = JsonWebKey.fromJson({
        'kty': 'oct',
        'k': base64Url.encode(rcekBytes).replaceAll('=', ''),
        'alg': 'A256GCM',
        'use': 'enc',
      });

      final jweObj = JsonWebEncryption.fromCompactSerialization(jwe);
      final keyStore = JsonWebKeyStore()..addKey(jwk);
      final payload = await jweObj.getPayload(keyStore);

      return json.decode(utf8.decode(payload.data));
    } on Object catch (e) {
      AppLogger.e('JweService: Response Decryption Error', e);
      throw Exception('Security sync failed: Response could not be verified.');
    }
  }
}
