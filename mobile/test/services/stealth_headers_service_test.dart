import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:mocktail/mocktail.dart';

class MockSecureStorageService extends Mock implements SecureStorageService {}

void main() {
  late MockSecureStorageService mockStorage;
  late StealthHeadersService service;

  setUp(() {
    mockStorage = MockSecureStorageService();
    service = StealthHeadersService(mockStorage);
  });

  test('getHeaders returns correct stealth headers concurrently without race condition', () async {
    when(() => mockStorage.getStealthInfo()).thenAnswer((_) async => null);

    // Run concurrent requests to reproduce race condition
    final results = await Future.wait([
      service.getHeaders(url: 'https://edu.ezygo.app/test1'),
      service.getHeaders(url: 'https://edu.ezygo.app/test2'),
    ]);

    expect(results.length, 2);
    for (final headers in results) {
      expect(headers['User-Agent'], isNotEmpty);
      expect(headers['Origin'], 'https://edu.ezygo.app');
    }
  });

  test('getHeaders uses custom info from storage when available', () async {
    when(() => mockStorage.getStealthInfo()).thenAnswer(
      (_) async => StealthInfo(
        browserName: 'Chrome',
        browserVersion: '141',
        userAgent: 'CustomUA',
        secChUa: '"Custom";v="99"',
      ),
    );

    final headers = await service.getHeaders(url: 'https://example.com');
    expect(headers['User-Agent'], 'CustomUA');
    expect(headers['Sec-Ch-Ua'], '"Custom";v="99"');
  });
}
