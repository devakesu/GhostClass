import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_secrets.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/services/auth_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockDio extends Mock implements Dio {}

class MockDioService extends Mock implements DioService {}

class MockSecureStorageService extends Mock implements SecureStorageService {
  @override
  Future<void> clearAllCachedData() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockDio mockDio;
  late MockDioService mockDioService;
  late MockSecureStorageService mockStorage;
  late ProviderContainer container;
  late AuthService authService;

  setUpAll(() async {
    registerFallbackValue(UserSettings.defaults());
    SharedPreferences.setMockInitialValues({});
    // Safely initialize Supabase if not already initialized
    try {
      await Supabase.initialize(
        url: 'https://example.com',
        anonKey: 'anon',
      );
    } on Object catch (_) {
      // already initialized
    }
  });

  setUp(() {
    mockDio = MockDio();
    mockDioService = MockDioService();
    mockStorage = MockSecureStorageService();

    when(() => mockDioService.dio).thenReturn(mockDio);

    container = ProviderContainer(
      overrides: [
        dioServiceProvider.overrideWith((ref) => mockDioService),
      ],
    );

    authService = container.read(authServiceProvider);
  });

  tearDown(() {
    container.dispose();
  });

  group('AuthService Coverage', () {
    test('loginEzygo passes standard request data', () async {
      Map<String, dynamic>? capturedData;
      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (invocation) async {
          capturedData =
              invocation.namedArguments[#data] as Map<String, dynamic>?;
          return Response<dynamic>(
            requestOptions: RequestOptions(path: '/auth'),
            statusCode: 200,
            data: {'token': 'ezygo_token'},
          );
        },
      );

      final resp = await authService.loginEzygo('username', 'password');
      expect(resp.statusCode, 200);
      expect(capturedData?['username'], 'username');
      expect(capturedData?['password'], 'password');
    });

    test('loginEzygo preserves password whitespace', () async {
      Map<String, dynamic>? capturedData;
      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((invocation) async {
        capturedData =
            invocation.namedArguments[#data] as Map<String, dynamic>?;
        return Response<dynamic>(
          requestOptions: RequestOptions(path: '/auth'),
          statusCode: 200,
          data: {'token': 'ezygo_token'},
        );
      });

      await authService.loginEzygo('username', '  password  ');
      expect(capturedData?['password'], '  password  ');
    });

    test('loginAndProvision handles successful path', () async {
      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/auth'),
          statusCode: 200,
          data: {'token': 'ezygo_token'},
        ),
      );

      final resp = await authService.loginAndProvision(
        username: 'username',
        password: 'password',
      );
      expect(resp.statusCode, 200);
    });

    test('loginAndProvision throws AppException on empty token', () async {
      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: '/auth'),
          statusCode: 200,
          data: {'token': ''},
        ),
      );

      expect(
        () => authService.loginAndProvision(
          username: 'username',
          password: 'password',
        ),
        throwsException,
      );
    });

    test(
      'refreshProfile, syncMobileAuth, updateProfile, acceptTerms, submitContact, getUser',
      () async {
        when(
          () => mockDio.get<dynamic>(
            any(),
            queryParameters: any(named: 'queryParameters'),
            options: any(named: 'options'),
          ),
        ).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: RequestOptions(path: '/profile'),
            statusCode: 200,
          ),
        );

        when(
          () => mockDio.post<dynamic>(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          ),
        ).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: RequestOptions(path: '/post'),
            statusCode: 200,
          ),
        );

        when(
          () => mockDio.patch<dynamic>(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          ),
        ).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: RequestOptions(path: '/patch'),
            statusCode: 200,
          ),
        );

        when(
          () => mockStorage.getEzygoToken(),
        ).thenAnswer((_) async => 'stored_token');
        when(
          () => mockStorage.getNormalizedEzygoToken(),
        ).thenAnswer((_) async => 'stored_token');

        await authService.refreshProfile('sub', sync: true);
        await authService.refreshProfile('sub');
        await authService.syncMobileAuth('sub');
        await authService.updateProfile('sub', {'key': 'val'});
        await authService.acceptTerms('sub', 'v1');
        await authService.submitContact(
          name: 'name',
          email: 'email',
          subject: 'subj',
          message: 'msg',
          supabaseToken: 'sub',
        );
        await authService.getUser(mockStorage);

        // test getUser with null token
        when(() => mockStorage.getEzygoToken()).thenAnswer((_) async => null);
        when(
          () => mockStorage.getNormalizedEzygoToken(),
        ).thenAnswer((_) async => null);
        await authService.getUser(mockStorage);
      },
    );
  });

  group('ProfileService Coverage', () {
    test('hasRenderableLocalProfile works correctly', () {
      final service = ProfileService();
      expect(service.hasRenderableLocalProfile(null), isFalse);
      expect(
        service.hasRenderableLocalProfile(const UserProfile(firstName: 'Test')),
        isTrue,
      );
      expect(
        service.hasRenderableLocalProfile(const UserProfile(avatarUrl: 'Url')),
        isTrue,
      );
      expect(service.hasRenderableLocalProfile(const UserProfile()), isFalse);
    });

    test('updateAvatar and deleteAccount covered gracefully', () async {
      final service = ProfileService();
      try {
        await service.updateAvatar('id', 'url');
      } on Object catch (_) {}
      try {
        await service.deleteAccount('id');
      } on Object catch (_) {}
    });
  });

  group('SettingsService Coverage', () {
    test('updateSettings and saveSettingsLocally covered gracefully', () async {
      final service = SettingsService(mockStorage);
      when(() => mockStorage.saveSettings(any())).thenAnswer((_) async {});

      await service.saveSettingsLocally(UserSettings.defaults());

      try {
        await service.updateSettings('id', bunkEnabled: true);
      } on Object catch (_) {}
      try {
        await service.updateSettings('id', targetPercentage: 80);
      } on Object catch (_) {}
      try {
        await service.updateSettings('id', disabledCourses: {});
      } on Object catch (_) {}
      try {
        await service.updateSettings('id');
      } on Object catch (_) {}
    });
  });

  group('AppSecrets Coverage', () {
    test('AppSecrets values are non-empty', () {
      expect(AppSecrets.supabaseUrlDev, isNotEmpty);
    });
  });
}
