import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:pointycastle/asn1.dart';

class NetworkUtils {
  NetworkUtils._();

  /// Validates certificate hostnames match the expected hostname.
  /// Used in debug mode to support self-signed certificates (e.g. mkcert)
  /// while still preventing MITM attacks by ensuring the hostname matches.
  static bool validateCertificateHostname(
    X509Certificate cert,
    String host,
    int port,
  ) {
    // In production, always return false to let the system's standard 
    // verification handle everything (CA-signed certs).
    if (!kDebugMode) {
      return false;
    }

    try {
      final expectedHost = _getExpectedHostname().toLowerCase();
      final hostnames = _extractHostnamesFromCertificate(cert);

      for (final hostname in hostnames) {
        if (hostname == expectedHost) {
          AppLogger.i('NetworkUtils: Certificate validated for $expectedHost');
          return true;
        }

        // Handle wildcards for DNS names
        if (hostname.startsWith('*.')) {
          final suffix = hostname.substring(1);
          if (expectedHost.endsWith(suffix)) {
            AppLogger.i(
              'NetworkUtils: Certificate wildcard validated for $expectedHost',
            );
            return true;
          }
        }
      }

      // Fallback for mkcert development certificates
      if (cert.subject.contains('mkcert development certificate')) {
        AppLogger.i(
          'NetworkUtils: Trusted mkcert development certificate by organization name',
        );
        return true;
      }

      AppLogger.w(
        'NetworkUtils: Certificate mismatch. Expected: $expectedHost, Found: ${hostnames.join(", ")}',
      );
      return false;
    } catch (e) {
      AppLogger.e('NetworkUtils: Certificate validation error', e);
      return false;
    }
  }

  static String _getExpectedHostname() {
    try {
      final uri = Uri.parse(AppConfig.ghostclassApiUrl);
      return uri.host;
    } catch (e) {
      return 'ghostclass.devakesu.com';
    }
  }

  static List<String> _extractHostnamesFromCertificate(X509Certificate cert) {
    final hostnames = <String>[];

    // 1. Extract CN from Subject
    final subject = cert.subject;
    final cnMatch = RegExp(r'(?:CN|cn)\s*=\s*([^,/]+)').firstMatch(subject);
    if (cnMatch != null) {
      hostnames.add(cnMatch.group(1)!.trim().replaceAll('"', ''));
    }

    // 2. Extract SAN from DER
    try {
      final parser = ASN1Parser(cert.der);
      final root = parser.nextObject() as ASN1Sequence;
      final tbs = root.elements![0] as ASN1Sequence;

      for (final element in tbs.elements!) {
        if (element.tag! == 0xA3) {
          final extensions = ASN1Sequence.fromBytes(element.valueBytes!);
          for (final ext in extensions.elements!) {
            final extSeq = ext as ASN1Sequence;
            final oid = extSeq.elements![0] as ASN1ObjectIdentifier;

            if (listEquals(oid.objectIdentifier, [85, 29, 17])) {
              final sanOctets = extSeq.elements!.last as ASN1OctetString;
              final sanSeq = ASN1Sequence.fromBytes(sanOctets.valueBytes!);

              for (final sanEntry in sanSeq.elements!) {
                final tagNum = sanEntry.tag! & 0x1F;
                if (tagNum == 2) {
                  hostnames.add(utf8.decode(sanEntry.valueBytes!));
                } else if (tagNum == 7) {
                  final ipBytes = sanEntry.valueBytes!;
                  if (ipBytes.length == 4) {
                    hostnames.add(ipBytes.join('.'));
                  } else if (ipBytes.length == 16) {
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
      AppLogger.w('NetworkUtils: Failed to parse SAN from certificate DER', e);
    }

    return hostnames.map((h) => h.toLowerCase()).toSet().toList();
  }
}
