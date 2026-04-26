import 'package:encrypt/encrypt.dart';
import 'package:flutter/foundation.dart' hide Key;

/// Wraps a sensitive string value with in-memory encryption.
/// 
/// The value is encrypted with a random session-key generated at app startup.
/// This prevents sensitive strings from being easily found in RAM dumps.
class EncryptedValue {
  static final _key = Key.fromSecureRandom(32);
  static final _iv = IV.fromSecureRandom(16);
  static final _encrypter = Encrypter(AES(_key, mode: AESMode.gcm));

  final String _encryptedBase64;

  EncryptedValue._(this._encryptedBase64);

  /// Creates an encrypted wrapper for a plaintext string.
  factory EncryptedValue.fromPlaintext(String plaintext) {
    final encrypted = _encrypter.encrypt(plaintext, iv: _iv);
    return EncryptedValue._(encrypted.base64);
  }

  /// Decrypts and returns the plaintext value.
  String get value {
    try {
      return _encrypter.decrypt64(_encryptedBase64, iv: _iv);
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
