import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
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

class MockFirebaseAnalytics extends Mock implements FirebaseAnalytics {}

void main() {
  late MockFirebaseMessaging mockMessaging;
  late MockNotificationSettings mockSettings;
  late MockDioService mockDioService;
  late MockSecureStorageService mockStorage;
  late MockDio mockDio;
  late MockSupabaseClient mockSupabase;
  late MockGoTrueClient mockAuth;
  late MockSession mockSession;
  late MockFirebaseAnalytics mockAnalytics;
  late ProviderContainer container;

  setUpAll(TestWidgetsFlutterBinding.ensureInitialized);

  setUp(() async {
    AnalyticsService.resetForTest();
    mockMessaging = MockFirebaseMessaging();
    mockSettings = MockNotificationSettings();
    mockDioService = MockDioService();
    mockStorage = MockSecureStorageService();
    mockDio = MockDio();
    mockSupabase = MockSupabaseClient();
    mockAuth = MockGoTrueClient();
    mockSession = MockSession();
    mockAnalytics = MockFirebaseAnalytics();

    when(() => mockDioService.dio).thenReturn(mockDio);
    when(() => mockSupabase.auth).thenReturn(mockAuth);
    when(() => mockAuth.currentSession).thenReturn(mockSession);
    when(() => mockSession.accessToken).thenReturn('mock-jwt-token');
    when(() => mockSession.isExpired).thenReturn(false);

    when(() => mockStorage.getFcmToken()).thenAnswer((_) async => null);
    when(() => mockStorage.saveFcmToken(any())).thenAnswer((_) async => true);

    when(
      () => mockAnalytics.setUserProperty(
        name: any(named: 'name'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => mockAnalytics.logAppOpen(parameters: any(named: 'parameters')),
    ).thenAnswer((_) async {});
    when(
      () => mockAnalytics.logEvent(
        name: any(named: 'name'),
        parameters: any(named: 'parameters'),
      ),
    ).thenAnswer((_) async {});

    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    container = ProviderContainer(
      overrides: [
        firebaseMessagingProvider.overrideWithValue(mockMessaging),
        dioServiceProvider.overrideWithValue(mockDioService),
        secureStorageProvider.overrideWithValue(mockStorage),
        supabaseClientProvider.overrideWithValue(mockSupabase),
      ],
    );

    addTearDown(container.dispose);
  });

  test(
    'initialize requests permission and syncs token if authorized',
    () async {
      final foregroundMessages = StreamController<RemoteMessage>();
      final openedMessages = StreamController<RemoteMessage>();

      when(
        () => mockSettings.authorizationStatus,
      ).thenReturn(AuthorizationStatus.authorized);
      when(
        () => mockMessaging.requestPermission(
          alert: any(named: 'alert'),
          badge: any(named: 'badge'),
          sound: any(named: 'sound'),
        ),
      ).thenAnswer((_) async => mockSettings);

      when(
        () => mockMessaging.getToken(),
      ).thenAnswer((_) async => 'new-fcm-token');
      when(
        () => mockMessaging.onTokenRefresh,
      ).thenAnswer((_) => const Stream.empty());

      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(),
          statusCode: 200,
        ),
      );

      final service = container.read(pushNotificationServiceProvider);
      await service.initialize(
        registerHandlers: false,
        onMessageStream: foregroundMessages.stream,
        onMessageOpenedAppStream: openedMessages.stream,
      );
      foregroundMessages.add(
        const RemoteMessage(
          notification: RemoteNotification(title: 'Foreground title'),
          data: {'kind': 'foreground'},
        ),
      );
      openedMessages.add(
        const RemoteMessage(
          notification: RemoteNotification(title: 'Opened title'),
          data: {'kind': 'opened'},
        ),
      );
      await Future<void>.delayed(Duration.zero);

      verify(() => mockStorage.saveFcmToken('new-fcm-token')).called(1);

      final foregroundVerification = verify(
        () => mockAnalytics.logEvent(
          name: 'fcm_foreground_received',
          parameters: captureAny(named: 'parameters'),
        ),
      );
      final foregroundParams =
          foregroundVerification.captured.single as Map<String, Object?>;
      expect(foregroundParams['env'], anyOf('development', 'production'));
      expect(foregroundParams['has_data'], true);

      final openedVerification = verify(
        () => mockAnalytics.logEvent(
          name: 'fcm_opened',
          parameters: captureAny(named: 'parameters'),
        ),
      );
      final openedParams =
          openedVerification.captured.single as Map<String, Object?>;
      expect(openedParams['env'], anyOf('development', 'production'));
      expect(openedParams['has_data'], true);

      await foregroundMessages.close();
      await openedMessages.close();
    },
  );

  test('initialize skips sync if token is null or unauthorized', () async {
    when(
      () => mockSettings.authorizationStatus,
    ).thenReturn(AuthorizationStatus.denied);
    when(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        badge: any(named: 'badge'),
        sound: any(named: 'sound'),
      ),
    ).thenAnswer((_) async => mockSettings);

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);

    verifyNever(() => mockStorage.saveFcmToken(any()));
  });

  test('dispose cancels token subscription safely', () {
    final service = container.read(pushNotificationServiceProvider);
    expect(service.dispose, returnsNormally);
  });

  test('handles analytics exceptions gracefully in FCM listeners', () async {
    final foregroundMessages = StreamController<RemoteMessage>();
    final openedMessages = StreamController<RemoteMessage>();

    when(
      () => mockSettings.authorizationStatus,
    ).thenReturn(AuthorizationStatus.authorized);
    when(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        badge: any(named: 'badge'),
        sound: any(named: 'sound'),
      ),
    ).thenAnswer((_) async => mockSettings);

    when(
      () => mockMessaging.getToken(),
    ).thenAnswer((_) async => 'new-fcm-token');
    when(
      () => mockMessaging.onTokenRefresh,
    ).thenAnswer((_) => const Stream.empty());

    when(
      () => mockDio.post<dynamic>(
        any(),
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<dynamic>(
        requestOptions: RequestOptions(),
        statusCode: 200,
      ),
    );

    // Mock analytics to throw exception
    when(
      () => mockAnalytics.logEvent(
        name: any(named: 'name'),
        parameters: any(named: 'parameters'),
      ),
    ).thenThrow(Exception('Analytics error'));

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(
      registerHandlers: false,
      onMessageStream: foregroundMessages.stream,
      onMessageOpenedAppStream: openedMessages.stream,
    );

    // These should not throw even though analytics fails
    foregroundMessages.add(
      const RemoteMessage(
        notification: RemoteNotification(title: 'Foreground title'),
        data: {'kind': 'foreground'},
      ),
    );
    openedMessages.add(
      const RemoteMessage(
        notification: RemoteNotification(title: 'Opened title'),
        data: {'kind': 'opened'},
      ),
    );
    await Future<void>.delayed(Duration.zero);

    await foregroundMessages.close();
    await openedMessages.close();
  });

  test('handles token sync errors gracefully', () async {
    when(
      () => mockSettings.authorizationStatus,
    ).thenReturn(AuthorizationStatus.authorized);
    when(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        badge: any(named: 'badge'),
        sound: any(named: 'sound'),
      ),
    ).thenAnswer((_) async => mockSettings);

    when(
      () => mockMessaging.getToken(),
    ).thenThrow(Exception('Failed to get token'));
    when(
      () => mockMessaging.onTokenRefresh,
    ).thenAnswer((_) => const Stream.empty());

    final service = container.read(pushNotificationServiceProvider);
    // Should complete without throwing even if token retrieval fails
    await expectLater(
      service.initialize(registerHandlers: false),
      completes,
    );
  });
}
