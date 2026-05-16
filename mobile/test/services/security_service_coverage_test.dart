import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

class MockDioService extends Mock implements DioService {}

void main() {
  late SecurityService securityService;
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

    securityService = container.read(securityServiceProvider);

    registerFallbackValue(Options());
  });

  tearDown(() {
    container.dispose();
  });

  group('SecurityService Coverage', () {
    test(
      'verifyIntegrity throws security exception on 403 with appCheckError',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        options.extra['appCheckError'] = 'Device not genuine';

        final dioError = DioException(
          requestOptions: options,
          response: Response(
            requestOptions: options,
            statusCode: 403,
            data: {'error': 'Forbidden'},
          ),
          type: DioExceptionType.badResponse,
        );

        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenThrow(dioError);

        expect(
          () => securityService.verifyIntegrity(),
          throwsA(
            predicate(
              (e) =>
                  e is AppException &&
                  e.message.contains('Device verification failed'),
            ),
          ),
        );
      },
    );

    test(
      'verifyIntegrity does NOT throw security exception on 401 WITHOUT security type',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');

        final dioError = DioException(
          requestOptions: options,
          response: Response(
            requestOptions: options,
            statusCode: 401,
            data: {'error': 'Unauthenticated'},
          ),
          type: DioExceptionType.badResponse,
        );

        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenThrow(dioError);

        expect(
          () => securityService.verifyIntegrity(),
          throwsA(isA<DioException>()),
        );
      },
    );

    test(
      'verifyIntegrity throws security exception on 401 WITH security type',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');

        final dioError = DioException(
          requestOptions: options,
          response: Response(
            requestOptions: options,
            statusCode: 401,
            data: {
              'type': 'security',
              'reason': 'Custom reason',
              'action': 'Contact support',
            },
          ),
          type: DioExceptionType.badResponse,
        );

        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenThrow(dioError);

        expect(
          () => securityService.verifyIntegrity(),
          throwsA(
            predicate(
              (e) => e is AppException && e.details?['type'] == 'security',
            ),
          ),
        );
      },
    );
  });
}
