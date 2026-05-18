import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:mocktail/mocktail.dart';

class MockX509Certificate extends Mock implements X509Certificate {}

void main() {
  group('NetworkUtils', () {
    late MockX509Certificate mockCert;

    setUp(() {
      mockCert = MockX509Certificate();
      when(() => mockCert.der).thenReturn(Uint8List(0));
    });

    test('validates mkcert development certificate', () {
      when(
        () => mockCert.subject,
      ).thenReturn('CN=mkcert development certificate,O=mkcert');
      final isValid = NetworkUtils.validateCertificateHostname(
        mockCert,
        'localhost',
        8080,
      );
      expect(isValid, true);
    });

    test('validates hostname matching expected host exactly', () {
      when(() => mockCert.subject).thenReturn('CN=192.168.0.103,O=Test');
      final isValid = NetworkUtils.validateCertificateHostname(
        mockCert,
        '192.168.0.100',
        8080,
      );
      expect(isValid, true);
    });

    test('returns false on mismatched CN', () {
      when(() => mockCert.subject).thenReturn('CN=evil.attacker.com,O=Test');
      final isValid = NetworkUtils.validateCertificateHostname(
        mockCert,
        'localhost',
        8080,
      );
      expect(isValid, false);
    });

    test('returns false on exception during parsing', () {
      when(() => mockCert.subject).thenThrow(Exception('Parse error'));
      final isValid = NetworkUtils.validateCertificateHostname(
        mockCert,
        'localhost',
        8080,
      );
      expect(isValid, false);
    });

    test(
      'evaluates wildcard certificate prefix and suffix matching safely',
      () {
        // Hits startsWith('*.') and substring extraction logic
        when(
          () => mockCert.subject,
        ).thenReturn('cn=*.localhost,O=TestWildcard');
        final isValid = NetworkUtils.validateCertificateHostname(
          mockCert,
          'localhost',
          8080,
        );
        expect(isValid, false); // 'localhost' does not end with '.localhost'

        // Also test Quoted strings handling in CN extraction
        when(() => mockCert.subject).thenReturn('CN="*.other.com",O=Quoted');
        final isOtherValid = NetworkUtils.validateCertificateHostname(
          mockCert,
          'localhost',
          8080,
        );
        expect(isOtherValid, false);
      },
    );
  });
}
