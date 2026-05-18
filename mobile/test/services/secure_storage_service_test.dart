import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockFlutterSecureStorage mockStorage;
  late SecureStorageService service;

  setUp(() {
    mockStorage = MockFlutterSecureStorage();
    service = SecureStorageService(mockStorage);
  });

  group('SecureStorageService Coverage', () {
    test('Verify storage getter', () {
      expect(service.storage, mockStorage);
    });

    test('Ezygo Token Operations', () async {
      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'test_token');
      when(
        () => mockStorage.delete(key: any(named: 'key')),
      ).thenAnswer((_) async {});

      await service.saveEzygoToken('test_token');
      final token = await service.getEzygoToken();
      await service.clearEzygoToken();

      expect(token, 'test_token');
      verify(
        () => mockStorage.write(key: 'ezygo_token', value: 'test_token'),
      ).called(1);
      verify(() => mockStorage.read(key: 'ezygo_token')).called(1);
      verify(() => mockStorage.delete(key: 'ezygo_token')).called(1);
    });

    test('FCM Token Operations', () async {
      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'fcm_token');

      await service.saveFcmToken('fcm_token');
      final token = await service.getFcmToken();

      expect(token, 'fcm_token');
      verify(
        () => mockStorage.write(key: 'fcm_token', value: 'fcm_token'),
      ).called(1);
      verify(() => mockStorage.read(key: 'fcm_token')).called(1);
    });

    test('Supabase User ID Operations', () async {
      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'supabase_id');

      await service.saveSupabaseUserId('supabase_id');
      final token = await service.getSupabaseUserId();

      expect(token, 'supabase_id');
      verify(
        () => mockStorage.write(key: 'supabase_user_id', value: 'supabase_id'),
      ).called(1);
      verify(() => mockStorage.read(key: 'supabase_user_id')).called(1);
    });

    test('Ezygo User ID and Username Operations', () async {
      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'ezygo_id');

      await service.saveEzygoUserId('ezygo_id');
      final token = await service.getEzygoUserId();

      expect(token, 'ezygo_id');
      verify(
        () => mockStorage.write(key: 'ezygo_user_id', value: 'ezygo_id'),
      ).called(1);
      verify(() => mockStorage.read(key: 'ezygo_user_id')).called(1);

      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'uname');

      await service.saveUsername('uname');
      final uname = await service.getUsername();

      expect(uname, 'uname');
      verify(
        () => mockStorage.write(key: 'username', value: 'uname'),
      ).called(1);
      verify(() => mockStorage.read(key: 'username')).called(1);
    });

    test('User Profile Operations', () async {
      const profile = UserProfile(
        firstName: 'Joe',
        lastName: 'Doe',
      );
      final jsonStr = jsonEncode(profile.toJson());

      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonStr);

      await service.saveUserProfile(profile);
      final fetched = await service.getUserProfile();

      expect(fetched?.firstName, 'Joe');

      // Test null profile
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      expect(await service.getUserProfile(), isNull);

      // Test malformed profile
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'invalid_json');
      expect(await service.getUserProfile(), isNull);
    });

    test('User Settings Operations', () async {
      final settings = UserSettings.defaults();
      final jsonStr = jsonEncode(settings.toJson());

      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonStr);

      await service.saveSettings(settings);
      final fetched = await service.getSettings();

      expect(fetched?.targetPercentage, settings.targetPercentage);

      // Test null settings
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      expect(await service.getSettings(), isNull);

      // Test malformed settings
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'invalid_json');
      expect(await service.getSettings(), isNull);
    });

    test('Terms Acceptance Operations', () async {
      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'v1.0');

      await service.saveTermsVersion('v1.0');
      final version = await service.getTermsVersion();

      expect(version, 'v1.0');
      verify(
        () => mockStorage.write(key: 'terms_version', value: 'v1.0'),
      ).called(1);
      verify(() => mockStorage.read(key: 'terms_version')).called(1);
    });

    test('Browser Stealth Info Operations', () async {
      final info = StealthInfo(
        browserName: 'Chrome',
        browserVersion: '120',
        userAgent: 'agent',
        secChUa: 'ua',
      );
      final jsonStr = jsonEncode(info.toJson());

      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonStr);

      await service.saveStealthInfo(info);
      final fetched = await service.getStealthInfo();

      expect(fetched?.userAgent, 'agent');

      // Test null info
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      expect(await service.getStealthInfo(), isNull);

      // Test malformed info
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'invalid_json');
      expect(await service.getStealthInfo(), isNull);
    });

    test('Generic TTL Cache Operations', () async {
      final payload = {
        'data': 'test_data',
        'expiry': DateTime.now()
            .add(const Duration(hours: 1))
            .millisecondsSinceEpoch,
      };
      final expiredPayload = {
        'data': 'test_data',
        'expiry': DateTime.now()
            .subtract(const Duration(hours: 1))
            .millisecondsSinceEpoch,
      };

      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.delete(key: any(named: 'key')),
      ).thenAnswer((_) async {});

      // Test write
      await service.saveCachedData('key', 'test_data');

      // Test read non-expired
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonEncode(payload));
      final res = await service.getCachedData('key');
      expect(res, 'test_data');

      // Test read expired
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonEncode(expiredPayload));
      final expiredRes = await service.getCachedData('key');
      expect(expiredRes, isNull);
      verify(() => mockStorage.delete(key: 'cache_key')).called(1);

      // Test read null
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      expect(await service.getCachedData('key'), isNull);

      // Test read malformed
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'invalid_json');
      expect(await service.getCachedData('key'), isNull);
    });

    test('Academic State Operations', () async {
      const state = AcademicState(semester: 'Odd', year: '2025-2026');
      final jsonStr = jsonEncode({'semester': 'Odd', 'year': '2025-2026'});

      when(
        () => mockStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => jsonStr);

      await service.saveAcademicState(state);
      final fetched = await service.getAcademicState();

      expect(fetched?.semester, 'Odd');
      expect(fetched?.year, '2025-2026');

      // Test null academic state
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      expect(await service.getAcademicState(), isNull);

      // Test malformed academic state
      when(
        () => mockStorage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => 'invalid_json');
      expect(await service.getAcademicState(), isNull);
    });

    test('Full Clear Operation', () async {
      when(() => mockStorage.deleteAll()).thenAnswer((_) async {});
      await service.clearAll();
      verify(() => mockStorage.deleteAll()).called(1);
    });

    test('Provider returns SecureStorageService', () {
      final container = ProviderContainer();
      final fetchedService = container.read(secureStorageProvider);
      expect(fetchedService, isA<SecureStorageService>());
      container.dispose();
    });
  });
}
