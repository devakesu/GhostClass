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
import 'package:pointycastle/asn1.dart';
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

  /// Extracts all valid hostnames and IP addresses from the certificate (CN and SAN)
  List<String> _extractHostnamesFromCertificate(X509Certificate cert) {
    final hostnames = <String>[];

    // 1. Extract CN from Subject Distinguished Name
    final subject = cert.subject;
    // Handle both comma and slash separators, and optional spaces
    final cnMatch = RegExp(r'(?:CN|cn)\s*=\s*([^,/]+)').firstMatch(subject);
    if (cnMatch != null) {
      hostnames.add(cnMatch.group(1)!.trim().replaceAll('"', ''));
    }

    // 2. Extract Subject Alternative Names (SAN) from DER encoding
    try {
      final parser = ASN1Parser(cert.der);
      final root = parser.nextObject() as ASN1Sequence;
      final tbs = root.elements![0] as ASN1Sequence;

      // Extensions are the last element in TBSCertificate, tagged [3]
      for (final element in tbs.elements!) {
        // Tag [3] is Context-specific (0x80) | Constructed (0x20) | 3 = 0xA3
        if (element.tag! == 0xA3) {
          // Inside the tagged object is the Extensions sequence
          // We need to skip the tag and length of the tagged object to get the sequence
          final extensions = ASN1Sequence.fromBytes(element.valueBytes!);
          for (final ext in extensions.elements!) {
            final extSeq = ext as ASN1Sequence;
            final oid = extSeq.elements![0] as ASN1ObjectIdentifier;

            // OID 2.5.29.17 is Subject Alternative Name
            if (listEquals(oid.objectIdentifier, [85, 29, 17])) {
              // The extension value is an OctetString containing the actual SAN sequence
              // It might be the second or third element depending on if 'critical' is present
              final sanOctets = extSeq.elements!.last as ASN1OctetString;
              final sanSeq = ASN1Sequence.fromBytes(sanOctets.valueBytes!);

              for (final sanEntry in sanSeq.elements!) {
                // SAN entries are tagged objects: dNSName [2], iPAddress [7]
                final tagNum = sanEntry.tag! & 0x1F;
                if (tagNum == 2) {
                  // dNSName [2] IA5String
                  hostnames.add(utf8.decode(sanEntry.valueBytes!));
                } else if (tagNum == 7) {
                  // iPAddress [7] OCTET STRING
                  final ipBytes = sanEntry.valueBytes!;
                  if (ipBytes.length == 4) {
                    hostnames.add(ipBytes.join('.'));
                  } else if (ipBytes.length == 16) {
                    // IPv6 support
                    final segments = <String>[];
                    for (var i = 0; i < 16; i += 2) {
                      segments.add(
                        ((ipBytes[i] << 8) | ipBytes[i + 1]).toRadixString(16),
                      );
                    }
                    hostnames.add(segments.join(':'));
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      AppLogger.w('JweService: Failed to parse SAN from certificate DER', e);
    }

    return hostnames.map((h) => h.toLowerCase()).toSet().toList();
  }

  /// Validates certificate hostnames match the expected hostname
  bool _validateCertificateHostname(
    X509Certificate cert,
    String host,
    int port,
  ) {
    final expectedHost = _getExpectedHostname().toLowerCase();

    // In production, reject and let standard verification handle it
    if (!kDebugMode) {
      return false;
    }

    try {
      final hostnames = _extractHostnamesFromCertificate(cert);

      for (final hostname in hostnames) {
        if (hostname == expectedHost) {
          AppLogger.i('JweService: Certificate validated for $expectedHost');
          return true;
        }

        // Handle wildcards for DNS names
        if (hostname.startsWith('*.')) {
          final suffix = hostname.substring(1);
          if (expectedHost.endsWith(suffix)) {
            AppLogger.i(
              'JweService: Certificate wildcard validated for $expectedHost',
            );
            return true;
          }
        }
      }

      // Fallback for mkcert organization in debug mode
      if (cert.subject.contains('mkcert development certificate')) {
        AppLogger.i(
          'JweService: Trusted mkcert development certificate by organization name',
        );
        return true;
      }

      AppLogger.w(
        'JweService: Certificate mismatch. Expected: $expectedHost, Found: ${hostnames.join(", ")}',
      );
      return false;
    } catch (e) {
      AppLogger.e('JweService: Certificate validation error', e);
      return false;
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
