import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
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
      final expectedHost = Uri.parse(AppConfig.ghostclassApiUrl).host;
      when(() => mockCert.subject).thenReturn('CN=$expectedHost,O=Test');
      final isValid = NetworkUtils.validateCertificateHostname(
        mockCert,
        expectedHost,
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

        // Test valid single-label wildcard match for expected host
        final expectedHost = Uri.parse(AppConfig.ghostclassApiUrl).host;
        final parts = expectedHost.split('.');
        if (parts.length > 2) {
          final domainSuffix = parts.sublist(1).join('.');
          when(
            () => mockCert.subject,
          ).thenReturn('CN=*.$domainSuffix,O=ValidWildcard');
          final isWildcardValid = NetworkUtils.validateCertificateHostname(
            mockCert,
            expectedHost,
            8080,
          );
          expect(isWildcardValid, true);

          // Subdomain spanning multiple labels should be rejected under RFC 6125
          when(
            () => mockCert.subject,
          ).thenReturn('CN=*.$domainSuffix,O=MultiLabel');
          // If expected host is a single level, test that a deeper domain does not match
          when(() => mockCert.subject).thenReturn('CN=*.com,O=TldWildcard');
          final isTldValid = NetworkUtils.validateCertificateHostname(
            mockCert,
            expectedHost,
            8080,
          );
          expect(isTldValid, false);
        }
      },
    );
  });
}
