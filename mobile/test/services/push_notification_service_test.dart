import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/push_notification_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockFirebaseMessaging extends Mock implements FirebaseMessaging {}
class MockNotificationSettings extends Mock implements NotificationSettings {}
class MockDioService extends Mock implements DioService {}
class MockSecureStorageService extends Mock implements SecureStorageService {}
class MockDio extends Mock implements Dio {}
class MockSupabaseClient extends Mock implements SupabaseClient {}
class MockGoTrueClient extends Mock implements GoTrueClient {}
class MockSession extends Mock implements Session {}

void main() {
  late MockFirebaseMessaging mockMessaging;
  late MockNotificationSettings mockSettings;
  late MockDioService mockDioService;
  late MockSecureStorageService mockStorage;
  late MockDio mockDio;
  late MockSupabaseClient mockSupabase;
  late MockGoTrueClient mockAuth;
  late MockSession mockSession;
  late ProviderContainer container;

  setUp(() {
    mockMessaging = MockFirebaseMessaging();
    mockSettings = MockNotificationSettings();
    mockDioService = MockDioService();
    mockStorage = MockSecureStorageService();
    mockDio = MockDio();
    mockSupabase = MockSupabaseClient();
    mockAuth = MockGoTrueClient();
    mockSession = MockSession();

    when(() => mockDioService.dio).thenReturn(mockDio);
    when(() => mockSupabase.auth).thenReturn(mockAuth);
    when(() => mockAuth.currentSession).thenReturn(mockSession);
    when(() => mockSession.accessToken).thenReturn('mock-jwt-token');

    when(() => mockStorage.getFcmToken()).thenAnswer((_) async => null);
    when(() => mockStorage.saveFcmToken(any())).thenAnswer((_) async => true);

    container = ProviderContainer(
      overrides: [
        firebaseMessagingProvider.overrideWithValue(mockMessaging),
        dioServiceProvider.overrideWithValue(mockDioService),
        secureStorageProvider.overrideWithValue(mockStorage),
        supabaseClientProvider.overrideWithValue(mockSupabase),
      ],
    );
  });

  test('initialize requests permission and syncs token if authorized', () async {
    when(() => mockSettings.authorizationStatus).thenReturn(AuthorizationStatus.authorized);
    when(() => mockMessaging.requestPermission(
      alert: any(named: 'alert'),
      badge: any(named: 'badge'),
      sound: any(named: 'sound'),
    )).thenAnswer((_) async => mockSettings);

    when(() => mockMessaging.getToken()).thenAnswer((_) async => 'new-fcm-token');
    when(() => mockMessaging.onTokenRefresh).thenAnswer((_) => const Stream.empty());

    when(() => mockDio.post(
      any(),
      data: any(named: 'data'),
      options: any(named: 'options'),
    )).thenAnswer((_) async => Response(
      requestOptions: RequestOptions(path: ''),
      statusCode: 200,
    ));

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);

    verify(() => mockStorage.saveFcmToken('new-fcm-token')).called(1);
  });

  test('initialize skips sync if token is null or unauthorized', () async {
    when(() => mockSettings.authorizationStatus).thenReturn(AuthorizationStatus.denied);
    when(() => mockMessaging.requestPermission(
      alert: any(named: 'alert'),
      badge: any(named: 'badge'),
      sound: any(named: 'sound'),
    )).thenAnswer((_) async => mockSettings);

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);

    verifyNever(() => mockStorage.saveFcmToken(any()));
  });

  test('dispose cancels token subscription safely', () {
    final service = container.read(pushNotificationServiceProvider);
    expect(() => service.dispose(), returnsNormally);
  });
}
