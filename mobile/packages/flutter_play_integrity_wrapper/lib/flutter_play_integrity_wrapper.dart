import 'dart:convert';
import 'dart:math';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// details about an error during the integrity token request.
class PlayIntegrityException implements Exception {
  final String code;
  final String message;
  final String? details;

  PlayIntegrityException({
    required this.code,
    required this.message,
    this.details,
  });

  @override
  String toString() => 'PlayIntegrityException(code: $code, message: $message, details: $details)';
}

class FlutterPlayIntegrityWrapper {
  // Must match the channel name in Kotlin
  static const MethodChannel _channel = MethodChannel('flutter_play_integrity_wrapper');

  /// Requests an integrity token from Google Play.
  ///
  /// [cloudProjectNumber]: The numeric project ID from Google Cloud Console.
  /// [nonce]: A unique string. If null, a secure random nonce (32 bytes) is generated automatically.
  ///
  /// **Security Note:** It is highly recommended to generate the [nonce] on your
  /// backend server to prevent replay attacks. Only use the auto-generated nonce
  /// for simple checks where replay attacks are not a concern.
  ///
  /// Returns the encrypted token string, or throws a [PlatformException] on failure.
  Future<String?> requestIntegrityToken({
    required String cloudProjectNumber,
    String? nonce,
  }) async {
    // 1. Use provided nonce OR generate a secure one if null
    final String finalNonce = nonce ?? _generateSecureNonce();

    try {
      // 2. Call the native platform
      final String? token = await _channel.invokeMethod('requestIntegrityToken', {
        'nonce': finalNonce,
        'cloudProjectNumber': cloudProjectNumber,
      });

      return token;
    } on PlatformException catch (e) {
      throw PlayIntegrityException(
        code: e.code,
        message: e.message ?? 'Unknown error occurred.',
        details: e.details?.toString(),
      );
    } catch (e) {
      throw PlayIntegrityException(
        code: 'UNKNOWN_ERROR',
        message: e.toString(),
      );
    }
  }

  /// Verifies the integrity token on the device by calling Google's API directly.
  ///
  /// **WARNING: NOT RECOMMENDED FOR PRODUCTION**
  /// This method requires exposing your Google Cloud API Key in the application binary,
  /// which allows anyone to extract it and use your quota.
  /// This should only be used for testing, debugging, or low-security scenarios.
  ///
  /// [token]: The integrity token returned by [requestIntegrityToken].
  /// [packageName]: The package name of the app (e.g. com.example.app).
  /// [apiKey]: The Google Cloud API Key with "Google Play Integrity API" enabled.
  ///
  /// Returns a [Map] containing the JSON response from Google, or throws an exception.
  Future<Map<String, dynamic>> verifyTokenOnDevice({
    required String token,
    required String packageName,
    required String apiKey,
  }) async {
    final uri = Uri.parse(
      'https://playintegrity.googleapis.com/v1/$packageName:decodeIntegrityToken?key=$apiKey',
    );

    try {
      final response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'integrityToken': token}),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      } else {
        throw PlayIntegrityException(
          code: 'VERIFICATION_FAILED',
          message: 'Google API returned ${response.statusCode}',
          details: response.body,
        );
      }
    } catch (e) {
      if (e is PlayIntegrityException) rethrow;
      throw PlayIntegrityException(
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to Google Verification API',
        details: e.toString(),
      );
    }
  }

  /// Generates a cryptographically secure random nonce.
  ///
  /// Google requires the raw bytes (before base64) to be > 16 bytes.
  /// We generate 32 bytes to be safe.
  String _generateSecureNonce() {
    final random = Random.secure();
    final values = List<int>.generate(32, (i) => random.nextInt(256));
    return base64Encode(values);
  }
}