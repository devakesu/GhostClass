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

    test('verifyIntegrity parses response with no updates correctly', () async {
      final options = RequestOptions(path: '/api/security/attestation');
      when(
        () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'verified': true,
            'latestVersion': '3.0.8',
            'minVersion': '3.0.8',
          },
        ),
      );

      final result = await securityService.verifyIntegrity();
      expect(result, isNotNull);
      expect(result!.latestVersion, '3.0.8');
      expect(result.minVersion, '3.0.8');
      expect(result.hasUpdate, isFalse);
      expect(result.isForceUpdate, isFalse);
    });

    test(
      'verifyIntegrity parses response with optional updates correctly',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': true,
              'latestVersion': '3.0.9',
              'minVersion': '3.0.8',
            },
          ),
        );

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(result!.latestVersion, '3.0.9');
        expect(result.minVersion, '3.0.8');
        expect(result.hasUpdate, isTrue);
        expect(result.isForceUpdate, isFalse);
      },
    );

    test(
      'verifyIntegrity parses response with forced updates correctly',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': true,
              'latestVersion': '3.1.0',
              'minVersion': '3.1.0',
            },
          ),
        );

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(result!.latestVersion, '3.1.0');
        expect(result.minVersion, '3.1.0');
        expect(result.hasUpdate, isTrue);
        expect(result.isForceUpdate, isTrue);
      },
    );

    test(
      'verifyIntegrity throws AppException on verified = false in 200 response',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': false,
              'reason': 'Custom verification failed',
              'action': 'Use official store version',
              'criticalRisk': true,
            },
          ),
        );

        expect(
          () => securityService.verifyIntegrity(),
          throwsA(
            predicate(
              (e) =>
                  e is AppException &&
                  e.message == 'Custom verification failed' &&
                  e.details?['action'] == 'Use official store version' &&
                  e.details?['criticalRisk'] == true,
            ),
          ),
        );
      },
    );

    test(
      'verifyIntegrity throws AppException on non-200 success response',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 500,
          ),
        );

        expect(
          () => securityService.verifyIntegrity(),
          throwsA(isA<AppException>()),
        );
      },
    );
  });
}
