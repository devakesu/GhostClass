import 'dart:convert';
import 'dart:math';

import 'package:encrypt/encrypt.dart';
import 'package:flutter/foundation.dart' hide Key;
import 'package:ghostclass/services/logger.dart';

/// Wraps a sensitive string value with in-memory encryption.
///
/// The value is encrypted with a session-ephemeral key that is reconstructed
/// on-demand using XOR-masked entropy. This prevents a single static key from
/// being easily identifiable in RAM dumps.
@immutable
class EncryptedValue {
  const EncryptedValue._(this._encryptedBase64);

  @visibleForTesting
  factory EncryptedValue.forTesting(String base64) => EncryptedValue._(base64);

  /// Creates an encrypted wrapper for a plaintext string.
  factory EncryptedValue.fromPlaintext(String plaintext) {
    if (plaintext.isEmpty) return const EncryptedValue._('');

    final key = _reconstructKey();
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

    // Generate a fresh random IV for each encryption (prevents GCM nonce-reuse)
    final iv = IV.fromSecureRandom(16);
    final encrypted = encrypter.encrypt(plaintext, iv: iv);

    // Prepend IV to ciphertext and encode as single base64 string
    final combined = Uint8List.fromList([...iv.bytes, ...encrypted.bytes]);
    final combinedBase64 = base64.encode(combined);

    return EncryptedValue._(combinedBase64);
  }
  // We store entropy in two separate buffers. XORing them reconstructs the key.
  static final Uint8List _entropyA = _generateRandomBytes(32);
  static final Uint8List _entropyB = _generateRandomBytes(32);

  final String _encryptedBase64;

  static Uint8List _generateRandomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(
      List.generate(length, (_) => random.nextInt(256)),
    );
  }

  /// Reconstructs the 32-byte AES key from masked entropy.
  /// The full key only exists in this local scope during execution.
  static Key _reconstructKey() {
    final keyBytes = Uint8List(32);
    for (var i = 0; i < 32; i++) {
      keyBytes[i] = _entropyA[i] ^ _entropyB[i];
    }
    return Key(keyBytes);
  }

  /// Overwrite entropy buffers to reduce risk of key reconstruction after logout.
  /// Call this when the app is performing a full logout or memory wipe.
  static void clearEntropy() {
    final random = Random.secure();
    for (var i = 0; i < _entropyA.length; i++) {
      _entropyA[i] = random.nextInt(256);
    }
    for (var i = 0; i < _entropyB.length; i++) {
      _entropyB[i] = random.nextInt(256);
    }
  }

  /// Decrypts and returns the plaintext value.
  String get value {
    if (_encryptedBase64.isEmpty) return '';

    try {
      final key = _reconstructKey();
      final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

      // Decode the base64 to get IV + ciphertext
      final combined = base64.decode(_encryptedBase64);

      // Split: first 16 bytes are IV, rest is ciphertext
      if (combined.length < 16) return '';
      final ivBytes = combined.sublist(0, 16);
      final ciphertextBytes = combined.sublist(16);

      final iv = IV(ivBytes);
      final encrypted = Encrypted(ciphertextBytes);

      return encrypter.decrypt(encrypted, iv: iv);
    } on Object catch (e) {
      AppLogger.e('EncryptedValue: Decryption failed', e);
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
