import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/encrypted_value.dart';

void main() {
  group('EncryptedValue', () {
    test('encrypts and decrypts correctly', () {
      final secret = EncryptedValue.fromPlaintext('my_super_secret_token');
      expect(secret.value, 'my_super_secret_token');
      expect(secret.toString(), 'EncryptedValue(****)');
    });

    test('handles empty strings', () {
      final secret = EncryptedValue.fromPlaintext('');
      expect(secret.value, '');
    });

    test('different encryptions of same string produce different ciphertexts but same decrypted value', () {
      final s1 = EncryptedValue.fromPlaintext('test');
      final s2 = EncryptedValue.fromPlaintext('test');
      expect(s1 == s2, false);
      expect(s1.value, s2.value);
    });

    test('equality and hashCode work on exact instance/ciphertext', () {
      final s1 = EncryptedValue.fromPlaintext('test');
      expect(s1 == s1, true);
      expect(s1.hashCode, isNotNull);
    });

    test('returns empty string when decryption fails on invalid ciphertext', () {
      // Must be >= 16 bytes to pass length check and hit decryption failure catch block
      final corrupted = EncryptedValue.forTesting('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU=');
      expect(corrupted.value, '');
    });
  });
}
