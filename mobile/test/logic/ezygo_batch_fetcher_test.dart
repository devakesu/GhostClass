import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/ezygo_batch_fetcher.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  group('EzygoBatchFetcher', () {
    late MockDio mockDio;
    var outageState = false;
    var backendUnauthorized = false;

    setUp(() {
      mockDio = MockDio();
      outageState = false;
      backendUnauthorized = false;
    });

    EzygoBatchFetcher createFetcher() {
      return EzygoBatchFetcher(
        mockDio,
        getOutage: () => outageState,
        setOutage: (val) => outageState = val,
        isBackendUnauthorized: () => backendUnauthorized,
      )..clearAll();
    }

    test('throws when token is empty', () async {
      final fetcher = createFetcher();
      await expectLater(
        fetcher.fetch(path: '/test', token: ''),
        throwsA(isA<AppException>()),
      );
    });

    test('blocks immediately if backend is unauthorized', () async {
      backendUnauthorized = true;
      final fetcher = createFetcher();
      await expectLater(
        fetcher.fetch(path: '/test', token: 'token'),
        throwsA(isA<DioException>()),
      );
    });

    test('blocks immediately if outage is active', () async {
      final fetcher = createFetcher();
      outageState = true;
      await expectLater(
        fetcher.fetch(path: '/test', token: 'token'),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'statusCode',
            503,
          ),
        ),
      );
      expect(outageState, true);
    });

    test('executes successful request and caches result', () async {
      final fetcher = createFetcher();
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/test'),
        statusCode: 200,
        data: {'success': true},
      );

      when(
        () => mockDio.request<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => res);

      final r1 = await fetcher.fetch(path: '/test', token: 'token');
      expect(r1.statusCode, 200);

      // Second fetch should hit cache and not call Dio again
      final r2 = await fetcher.fetch(path: '/test', token: 'token');
      expect(r2, r1);
      verify(
        () => mockDio.request<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).called(1);
    });

    test('negative caches 5xx responses and sets outage', () async {
      final fetcher = createFetcher();
      final res500 = Response<dynamic>(
        requestOptions: RequestOptions(path: '/test'),
        statusCode: 500,
      );

      when(
        () => mockDio.request<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => res500);

      final r1 = await fetcher.fetch(path: '/test', token: 'token');
      expect(r1.statusCode, 500);
      expect(outageState, true);

      // Outage state is now true, so next call should throw outage lock DioException
      await expectLater(
        fetcher.fetch(path: '/test', token: 'token'),
        throwsA(isA<DioException>()),
      );
    });

    test('handles network exceptions by setting outage state', () async {
      final fetcher = createFetcher();
      final dioErr = DioException(
        requestOptions: RequestOptions(path: '/test'),
        type: DioExceptionType.connectionTimeout,
      );

      when(
        () => mockDio.request<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) => Future.error(dioErr));

      await expectLater(
        fetcher.fetch(path: '/test', token: 'token'),
        throwsA(isA<DioException>()),
      );
      expect(outageState, true);
    });

    test('encodes POST request data and caches successfully', () async {
      final fetcher = createFetcher();
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/post'),
        statusCode: 200,
        data: {'posted': true},
      );

      when(
        () => mockDio.request<dynamic>(
          '/post',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => res);

      final r = await fetcher.fetch(
        path: '/post',
        token: 'token',
        method: 'POST',
        data: {'param': 'value'},
      );
      expect(r.statusCode, 200);
    });

    test(
      'deduplicates request data regardless of map insertion order',
      () async {
        final fetcher = createFetcher();
        final res = Response<dynamic>(
          requestOptions: RequestOptions(path: '/order'),
          statusCode: 200,
          data: {'ok': true},
        );

        when(
          () => mockDio.request<dynamic>(
            '/order',
            data: any(named: 'data'),
            options: any(named: 'options'),
          ),
        ).thenAnswer((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 50));
          return res;
        });

        final firstPayload = <String, dynamic>{'a': 1, 'b': 2};
        final secondPayload = <String, dynamic>{'b': 2, 'a': 1};

        final results = await Future.wait([
          fetcher.fetch(
            path: '/order',
            token: 'token',
            method: 'POST',
            data: firstPayload,
          ),
          fetcher.fetch(
            path: '/order',
            token: 'token',
            method: 'POST',
            data: secondPayload,
          ),
        ]);

        expect(results[0], results[1]);
        verify(
          () => mockDio.request<dynamic>(
            '/order',
            data: any(named: 'data'),
            options: any(named: 'options'),
          ),
        ).called(1);
      },
    );

    test('deduplicates identical concurrent in-flight requests', () async {
      final fetcher = createFetcher();
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/dedup'),
        statusCode: 200,
        data: {'ok': true},
      );

      when(
        () => mockDio.request<dynamic>(
          '/dedup',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return res;
      });

      // Launch two requests simultaneously
      final futures = Future.wait([
        fetcher.fetch(path: '/dedup', token: 'token'),
        fetcher.fetch(path: '/dedup', token: 'token'),
      ]);

      final results = await futures;
      expect(results[0], results[1]);
      verify(
        () => mockDio.request<dynamic>(
          '/dedup',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).called(1);
    });

    test('queues requests exceeding max concurrent limit', () async {
      final fetcher = createFetcher();
      when(
        () => mockDio.request<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((invocation) async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return Response<dynamic>(
          requestOptions: RequestOptions(
            path: invocation.positionalArguments[0] as String,
          ),
          statusCode: 200,
        );
      });

      // Launch 4 distinct requests concurrently (limit is 3)
      final futures = Future.wait([
        fetcher.fetch(path: '/q1', token: 'token'),
        fetcher.fetch(path: '/q2', token: 'token'),
        fetcher.fetch(path: '/q3', token: 'token'),
        fetcher.fetch(path: '/q4', token: 'token'),
      ]);

      final results = await futures;
      expect(results.length, 4);
    });
  });
}
