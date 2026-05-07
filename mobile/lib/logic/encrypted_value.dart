import 'dart:convert';

import 'package:encrypt/encrypt.dart';
import 'package:flutter/foundation.dart' hide Key;

/// Wraps a sensitive string value with in-memory encryption.
///
/// The value is encrypted with a random session-key generated at app startup.
/// This prevents sensitive strings from being easily found in RAM dumps.
class EncryptedValue {
  static final _key = Key.fromSecureRandom(32);
  static final _encrypter = Encrypter(AES(_key, mode: AESMode.gcm));

  final String _encryptedBase64;

  EncryptedValue._(this._encryptedBase64);

  /// Creates an encrypted wrapper for a plaintext string.
  ///
  /// Generates a fresh random IV for each encryption to prevent GCM nonce-reuse
  /// attacks. The IV is prepended to the ciphertext (IVs don't need to be secret).
  factory EncryptedValue.fromPlaintext(String plaintext) {
    // Generate a fresh random IV for each encryption (CRITICAL: prevents nonce reuse)
    final iv = IV.fromSecureRandom(16);
    final encrypted = _encrypter.encrypt(plaintext, iv: iv);

    // Prepend IV to ciphertext and encode as single base64 string
    final combined = Uint8List.fromList([...iv.bytes, ...encrypted.bytes]);
    final combinedBase64 = base64.encode(combined);

    return EncryptedValue._(combinedBase64);
  }

  /// Decrypts and returns the plaintext value.
  ///
  /// Extracts the IV from the beginning of the stored ciphertext and uses it
  /// for decryption. This ensures the same IV used during encryption is retrieved.
  String get value {
    try {
      // Decode the base64 to get IV + ciphertext
      final combined = base64.decode(_encryptedBase64);

      // Split: first 16 bytes are IV, rest is ciphertext
      final ivBytes = combined.sublist(0, 16);
      final ciphertextBytes = combined.sublist(16);

      final iv = IV(ivBytes);
      final encrypted = Encrypted(ciphertextBytes);

      return _encrypter.decrypt(encrypted, iv: iv);
    } catch (e) {
      if (kDebugMode) print('EncryptedValue: Decryption failed: $e');
      return '';
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EncryptedValue &&
          runtimeType == other.runtimeType &&
          _encryptedBase64 == other._encryptedBase64;

  @override
  int get hashCode => _encryptedBase64.hashCode;

  @override
  String toString() => 'EncryptedValue(****)';
}
