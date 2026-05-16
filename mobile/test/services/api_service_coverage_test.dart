import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

class MockDioService extends Mock implements DioService {}

void main() {
  late ApiService apiService;
  late MockDio mockDio;
  late MockDioService mockDioService;
  late ProviderContainer container;

  setUp(() {
    mockDio = MockDio();
    mockDioService = MockDioService();

    when(() => mockDioService.dio).thenReturn(mockDio);

    container = ProviderContainer(
      overrides: [
        dioServiceProvider.overrideWith((ref) => mockDioService),
      ],
    );

    apiService = container.read(apiServiceProvider);
  });

  tearDown(() {
    container.dispose();
  });

  group('ApiService Coverage', () {
    test('mapDioError merges backend response data into details', () {
      final responseData = {
        'type': 'security',
        'reason': 'Handshake failed',
        'action': 'Retry',
      };

      final options = RequestOptions(path: '/test');
      options.extra['appCheckError'] = 'local-error';

      final dioError = DioException(
        requestOptions: options,
        response: Response(
          requestOptions: options,
          data: responseData,
          statusCode: 401,
        ),
        type: DioExceptionType.badResponse,
      );

      final exception = apiService.mapDioError(dioError);

      expect(exception.details?['type'], 'security');
      expect(exception.details?['reason'], 'Handshake failed');
      expect(exception.details?['action'], 'Retry');
      expect(exception.details?['appCheckError'], 'local-error');
    });

    test('mapDioError handles non-map response data gracefully', () {
      final options = RequestOptions(path: '/test');
      final dioError = DioException(
        requestOptions: options,
        response: Response(
          requestOptions: options,
          data: 'Not a map',
          statusCode: 500,
        ),
        type: DioExceptionType.badResponse,
      );

      final exception = apiService.mapDioError(dioError);
      expect(exception.details?['appCheckError'], isNull);
    });
  });
}
