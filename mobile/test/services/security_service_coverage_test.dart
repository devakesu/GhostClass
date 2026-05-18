import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

class MockDioService extends Mock implements DioService {}

class MockSecureStorageService extends Mock implements SecureStorageService {}

void main() {
  late SecurityService securityService;
  late MockDio mockDio;
  late MockDioService mockDioService;
  late MockSecureStorageService mockSecureStorage;
  late ProviderContainer container;

  setUp(() {
    mockDio = MockDio();
    mockDioService = MockDioService();
    mockSecureStorage = MockSecureStorageService();

    when(() => mockDioService.dio).thenReturn(mockDio);
    when(
      () => mockSecureStorage.getAttestationResult(),
    ).thenAnswer((_) async => null);
    when(
      () => mockSecureStorage.saveAttestationResult(any()),
    ).thenAnswer((_) async {});

    container = ProviderContainer(
      overrides: [
        dioServiceProvider.overrideWith((ref) => mockDioService),
        secureStorageProvider.overrideWith((ref) => mockSecureStorage),
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
      final version = AppConfig.appVersion;
      when(
        () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'verified': true,
            'latestVersion': version,
            'minVersion': version,
          },
        ),
      );

      final result = await securityService.verifyIntegrity();
      expect(result, isNotNull);
      expect(result!.latestVersion, version);
      expect(result.minVersion, version);
      expect(result.hasUpdate, isFalse);
      expect(result.isForceUpdate, isFalse);
    });

    test(
      'verifyIntegrity parses response with optional updates correctly',
      () async {
        final currentParts = AppConfig.appVersion
            .split('.')
            .map(int.parse)
            .toList();
        final nextPatchVersion =
            '${currentParts[0]}.${currentParts[1]}.${currentParts[2] + 1}';
        final currentVersion = AppConfig.appVersion;

        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': true,
              'latestVersion': nextPatchVersion,
              'minVersion': currentVersion,
            },
          ),
        );

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(result!.latestVersion, nextPatchVersion);
        expect(result.minVersion, currentVersion);
        expect(result.hasUpdate, isTrue);
        expect(result.isForceUpdate, isFalse);
      },
    );

    test(
      'verifyIntegrity parses response with forced updates correctly',
      () async {
        final currentParts = AppConfig.appVersion
            .split('.')
            .map(int.parse)
            .toList();
        final nextMinorVersion = '${currentParts[0]}.${currentParts[1] + 1}.0';

        final options = RequestOptions(path: '/api/security/attestation');
        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': true,
              'latestVersion': nextMinorVersion,
              'minVersion': nextMinorVersion,
            },
          ),
        );

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(result!.latestVersion, nextMinorVersion);
        expect(result.minVersion, nextMinorVersion);
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

    test(
      'verifyIntegrity clamps latestVersion to minVersion when latestVersion is older than minVersion',
      () async {
        final options = RequestOptions(path: '/api/security/attestation');
        const minVersion = '4.7.0';
        const olderLatestVersion = '4.2.9';

        when(
          () => mockDio.get<dynamic>(any(), options: any(named: 'options')),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'verified': true,
              'latestVersion': olderLatestVersion,
              'minVersion': minVersion,
            },
          ),
        );

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(
          result!.latestVersion,
          minVersion,
        ); // Should be clamped to minVersion
        expect(result.minVersion, minVersion);
        expect(
          result.hasUpdate,
          isTrue,
        ); // Should be true since currentVersion (4.2.9) < latestVersion (4.7.0)
        expect(result.isForceUpdate, isTrue);
      },
    );

    test(
      'verifyIntegrity recomputes hasUpdate and isForceUpdate from cache against AppConfig.appVersion',
      () async {
        final cachedJson =
            '{"latestVersion": "${AppConfig.appVersion}", "minVersion": "${AppConfig.appVersion}", "hasUpdate": true, "isForceUpdate": true}';

        when(
          () => mockSecureStorage.getAttestationResult(),
        ).thenAnswer((_) async => cachedJson);

        final result = await securityService.verifyIntegrity();
        expect(result, isNotNull);
        expect(result!.latestVersion, AppConfig.appVersion);
        expect(result.minVersion, AppConfig.appVersion);
        expect(result.hasUpdate, isFalse); // Recomputed dynamically
        expect(result.isForceUpdate, isFalse); // Recomputed dynamically
      },
    );
  });
}
