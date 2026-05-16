import 'dart:async';
import 'package:dio/dio.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/jwe_interceptor.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAppCheck extends Mock implements FirebaseAppCheck {}

class MockJweService extends Mock implements JweService {}

void main() {
  late MockFirebaseAppCheck mockAppCheck;
  late MockJweService mockJweService;
  late ProviderContainer container;
  late DioService dioService;

  setUp(() {
    mockAppCheck = MockFirebaseAppCheck();
    mockJweService = MockJweService();

    when(
      () => mockJweService.encryptHeaderKey(),
    ).thenAnswer((_) async => (jwe: 'mock-key', rcek: 'mock-rcek'));

    container = ProviderContainer(
      overrides: [
        appCheckProvider.overrideWithValue(mockAppCheck),
        jweInterceptorProvider.overrideWithValue(
          JweInterceptor(mockJweService),
        ),
      ],
    );
    dioService = container.read(dioServiceProvider);
  });

  tearDown(() async {
    await dioService.close();
    container.dispose();
  });

  group('DioService App Check Deduplication', () {
    test('deduplicates parallel getToken calls', () async {
      final completer = Completer<String>();

      when(() => mockAppCheck.getToken()).thenAnswer((_) => completer.future);

      final future1 = dioService.dio.get<dynamic>('/test');
      final future2 = dioService.dio.get<dynamic>('/test');

      await Future<void>.delayed(const Duration(milliseconds: 50));

      completer.complete('mock-token');

      await Future.wait<dynamic>([
        future1,
        future2,
      ]).catchError((_) => <Response<dynamic>>[]);

      verify(() => mockAppCheck.getToken()).called(1);
    });

    test('deduplicates parallel getLimitedUseToken calls', () async {
      final completer = Completer<String>();

      when(
        () => mockAppCheck.getLimitedUseToken(),
      ).thenAnswer((_) => completer.future);

      final future1 = dioService.dio.get<dynamic>(
        '/test',
        options: Options(extra: {'useLimitedToken': true}),
      );
      final future2 = dioService.dio.get<dynamic>(
        '/test',
        options: Options(extra: {'useLimitedToken': true}),
      );

      await Future<void>.delayed(const Duration(milliseconds: 50));

      completer.complete('limited-token');

      await Future.wait<dynamic>([
        future1,
        future2,
      ]).catchError((_) => <Response<dynamic>>[]);

      verify(() => mockAppCheck.getLimitedUseToken()).called(1);
    });

    test('clears in-flight future on error to allow retries', () async {
      when(
        () => mockAppCheck.getToken(),
      ).thenAnswer((_) => Future.error(Exception('Token error')));

      await dioService.dio
          .get<dynamic>('/test')
          .catchError(
            (_) => Response<dynamic>(requestOptions: RequestOptions()),
          );

      when(
        () => mockAppCheck.getToken(),
      ).thenAnswer((_) => Future.value('new-token'));

      await dioService.dio
          .get<dynamic>('/test')
          .catchError(
            (_) => Response<dynamic>(requestOptions: RequestOptions()),
          );

      verify(() => mockAppCheck.getToken()).called(2);
    });

    test('handles empty token case', () async {
      when(() => mockAppCheck.getToken()).thenAnswer((_) => Future.value(''));

      final options = RequestOptions(
        path: '/test',
        baseUrl: AppConfig.ghostclassApiUrl,
      );
      await dioService.dio
          .fetch<dynamic>(options)
          .catchError((_) => Response<dynamic>(requestOptions: options));

      expect(
        options.extra['appCheckError'],
        contains('App Check token is empty'),
      );
    });
  });
}
