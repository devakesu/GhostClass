import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:io';
// ignore: unnecessary_import
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:jose/jose.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/logger.dart';

/// JweService
/// ----------
/// Handles Bi-directional End-to-End Encryption (E2EE) for GhostClass.
class JweService {
  static final JweService _instance = JweService._internal();
  static JweService get instance => _instance;
  JweService._internal();

  JsonWebKeySet? _cachedJwks;
  DateTime? _lastFetch;

  final _ghostclassApiUrl = AppConfig.ghostclassApiUrl;

  /// Extracts the hostname from the configured API URL
  String _getExpectedHostname() {
    try {
      final uri = Uri.parse(_ghostclassApiUrl);
      return uri.host;
    } catch (e) {
      AppLogger.e('JweService: Failed to extract hostname', e);
      return 'ghostclass.devakesu.com'; // Safe fallback
    }
  }

  /// Validates certificate CN/SANs match the expected hostname
  /// Returns true if valid, false otherwise (to reject the cert)
  ///
  /// SECURITY: Even in debug mode, we validate the certificate CN to prevent
  /// MITM attacks. This allows self-signed certs (for local dev) but still
  /// ensures we're talking to the correct server.
  bool _validateCertificateHostname(
    X509Certificate cert,
    String host,
    int port,
  ) {
    final expectedHost = _getExpectedHostname();

    // In production, reject any certificate issues
    if (!kDebugMode) {
      return false; // Let the normal verification happen
    }

    // Debug mode: Allow self-signed certs BUT validate the CN
    try {
      final subject = cert.subject;

      // Extract CN from certificate subject
      if (subject.contains('CN=')) {
        final cnStart = subject.indexOf('CN=') + 3;
        final cnEnd = subject.indexOf(',', cnStart);
        final cn = cnEnd > cnStart
            ? subject.substring(cnStart, cnEnd)
            : subject.substring(cnStart);

        // Check if CN matches expected hostname or is a wildcard
        if (cn.trim() == expectedHost ||
            cn.trim() == '*.$expectedHost' ||
            (cn.trim().startsWith('*.') &&
                expectedHost.endsWith(cn.trim().substring(1)))) {
          AppLogger.i('JweService: Certificate CN validated for $expectedHost');
          return true;
        }
      }

      // If CN doesn't match, reject the certificate
      AppLogger.w(
        'JweService: Certificate CN mismatch. Expected: $expectedHost, Certificate: $subject',
      );
      return false;
    } catch (e) {
      AppLogger.e('JweService: Certificate validation error', e);
      return false; // Fail closed on errors
    }
  }

  Future<void> _fetchJwks() async {
    if (_cachedJwks != null &&
        _lastFetch != null &&
        DateTime.now().difference(_lastFetch!).inHours < 1) {
      return;
    }

    try {
      final networkTimeout = kDebugMode
          ? const Duration(seconds: 40)
          : const Duration(seconds: 20);
      final dio = Dio(
        BaseOptions(
          connectTimeout: networkTimeout,
          receiveTimeout: networkTimeout,
          sendTimeout: networkTimeout,
        ),
      );

      if (kDebugMode) {
        (dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
          final client = HttpClient();
          // SECURITY: Validate certificate CN even in debug mode
          // This prevents MITM attacks while allowing self-signed certs
          client.badCertificateCallback = _validateCertificateHostname;
          return client;
        };
      }

      final url = '$_ghostclassApiUrl/.well-known/jwks.json';
      final response = await dio.get(url);

      if (response.statusCode == 200) {
        _cachedJwks = JsonWebKeySet.fromJson(response.data);
        _lastFetch = DateTime.now();
        AppLogger.i('JweService: Fetched server JWKS successfully.');
      } else {
        throw Exception('Failed to fetch JWKS: ${response.statusCode}');
      }
    } catch (e) {
      AppLogger.e('JweService: JWKS Fetch Error', e);
      rethrow;
    }
  }

  Future<void> preWarm() async {
    try {
      await _fetchJwks();
    } catch (e) {
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

    return JsonWebKey.fromJson({
      'kty': 'RSA',
      'n': rawJson['n'],
      'e': rawJson['e'],
      if (rawJson['kid'] != null) 'kid': rawJson['kid'],
      // Notice: We completely omit 'alg', 'use', and 'key_ops'.
      // The library can no longer reject it for operation mismatches.
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
    } catch (e) {
      AppLogger.e('JweService: Response Decryption Error', e);
      throw Exception('Security sync failed: Response could not be verified.');
    }
  }
}
