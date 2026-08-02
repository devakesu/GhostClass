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
  const EncryptedValue._(
    this._encryptedBase64,
    this._entropyA,
    this._entropyB,
    this._generation,
  );

  @visibleForTesting
  factory EncryptedValue.forTesting(String base64) =>
      EncryptedValue._(base64, Uint8List(0), Uint8List(0), _globalGeneration);

  /// Creates an encrypted wrapper for a plaintext string.
  factory EncryptedValue.fromPlaintext(String plaintext) {
    if (plaintext.isEmpty) {
      return EncryptedValue._(
        '',
        Uint8List(0),
        Uint8List(0),
        _globalGeneration,
      );
    }

    final entropyA = _generateRandomBytes(32);
    final entropyB = _generateRandomBytes(32);
    final key = _reconstructKey(entropyA, entropyB);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

    // Generate a fresh random IV for each encryption (prevents GCM nonce-reuse)
    final iv = IV.fromSecureRandom(16);
    final encrypted = encrypter.encrypt(plaintext, iv: iv);

    // Prepend IV to ciphertext and encode as single base64 string
    final combined = Uint8List.fromList([...iv.bytes, ...encrypted.bytes]);
    final combinedBase64 = base64.encode(combined);

    return EncryptedValue._(
      combinedBase64,
      entropyA,
      entropyB,
      _globalGeneration,
    );
  }

  static int _globalGeneration = 0;

  final String _encryptedBase64;
  final Uint8List _entropyA;
  final Uint8List _entropyB;
  final int _generation;

  static Uint8List _generateRandomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(
      List.generate(length, (_) => random.nextInt(256)),
    );
  }

  /// Reconstructs the 32-byte AES key from masked entropy.
  /// The full key only exists in this local scope during execution.
  static Key _reconstructKey(Uint8List entropyA, Uint8List entropyB) {
    if (entropyA.length != 32 || entropyB.length != 32) {
      return Key(Uint8List(32));
    }
    final keyBytes = Uint8List(32);
    for (var i = 0; i < 32; i++) {
      keyBytes[i] = entropyA[i] ^ entropyB[i];
    }
    return Key(keyBytes);
  }

  /// Invalidate session entropy generation counter when performing a logout or memory wipe.
  static void clearEntropy() {
    _globalGeneration++;
  }

  /// Decrypts and returns the plaintext value.
  String get value {
    if (_encryptedBase64.isEmpty) return '';
    if (_generation != _globalGeneration) return '';

    try {
      final key = _reconstructKey(_entropyA, _entropyB);
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
