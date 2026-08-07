import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/push_notification_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
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

class MockGoRouter extends Mock implements GoRouter {}

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
    when(
      () => mockStorage.getNormalizedFcmToken(),
    ).thenAnswer((_) async => null);
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

    when(
      () => mockMessaging.setForegroundNotificationPresentationOptions(
        alert: any(named: 'alert'),
        badge: any(named: 'badge'),
        sound: any(named: 'sound'),
      ),
    ).thenAnswer((_) async {});

    await AnalyticsService.initialize(analyticsInstance: mockAnalytics);

    final mockRouter = GoRouter(
      navigatorKey: GlobalKey<NavigatorState>(),
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const SizedBox(),
        ),
      ],
    );

    container = ProviderContainer(
      overrides: [
        firebaseMessagingProvider.overrideWithValue(mockMessaging),
        dioServiceProvider.overrideWithValue(mockDioService),
        secureStorageProvider.overrideWithValue(mockStorage),
        supabaseClientProvider.overrideWithValue(mockSupabase),
        routerProvider.overrideWithValue(mockRouter),
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

  test(
    'dispose cancels token subscription safely and resets initialized state',
    () async {
      final service = container.read(pushNotificationServiceProvider);
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

      await service.initialize(registerHandlers: false);
      expect(service.isInitialized, true);

      expect(service.dispose, returnsNormally);
      expect(service.isInitialized, false);
    },
  );

  test('initialize skips subsequent calls unless force is true', () async {
    when(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        announcement: any(named: 'announcement'),
        badge: any(named: 'badge'),
        carPlay: any(named: 'carPlay'),
        criticalAlert: any(named: 'criticalAlert'),
        provisional: any(named: 'provisional'),
        sound: any(named: 'sound'),
      ),
    ).thenAnswer((_) async => mockSettings);
    when(
      () => mockSettings.authorizationStatus,
    ).thenReturn(AuthorizationStatus.authorized);
    when(
      () => mockMessaging.getToken(),
    ).thenAnswer((_) async => 'fcm-token');
    when(
      () => mockMessaging.onTokenRefresh,
    ).thenAnswer((_) => const Stream.empty());

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);
    expect(service.isInitialized, true);

    // Call initialize again without force (should be skipped)
    await service.initialize(registerHandlers: false);
    verify(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        announcement: any(named: 'announcement'),
        badge: any(named: 'badge'),
        carPlay: any(named: 'carPlay'),
        criticalAlert: any(named: 'criticalAlert'),
        provisional: any(named: 'provisional'),
        sound: any(named: 'sound'),
      ),
    ).called(1);

    // Call initialize with force: true (should execute)
    await service.initialize(registerHandlers: false, force: true);
    verify(
      () => mockMessaging.requestPermission(
        alert: any(named: 'alert'),
        announcement: any(named: 'announcement'),
        badge: any(named: 'badge'),
        carPlay: any(named: 'carPlay'),
        criticalAlert: any(named: 'criticalAlert'),
        provisional: any(named: 'provisional'),
        sound: any(named: 'sound'),
      ),
    ).called(1);
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

  testWidgets(
    'displays beautiful in-app banner on foreground FCM event and navigates on tap',
    (tester) async {
      final foregroundMessages = StreamController<RemoteMessage>();

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
      ).thenAnswer((_) async => 'mock-fcm-token');
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

      final router = GoRouter(
        navigatorKey: GlobalKey<NavigatorState>(),
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const Scaffold(
              body: Center(child: Text('Main Screen')),
            ),
          ),
          GoRoute(
            path: '/notifications',
            builder: (context, state) => const Scaffold(
              body: Center(child: Text('Notifications Screen')),
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            firebaseMessagingProvider.overrideWithValue(mockMessaging),
            dioServiceProvider.overrideWithValue(mockDioService),
            secureStorageProvider.overrideWithValue(mockStorage),
            supabaseClientProvider.overrideWithValue(mockSupabase),
            routerProvider.overrideWithValue(router),
          ],
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );

      final rootContext = tester.element(find.byType(MaterialApp));
      final container = ProviderScope.containerOf(rootContext);
      final service = container.read(pushNotificationServiceProvider);

      await service.initialize(
        registerHandlers: false,
        onMessageStream: foregroundMessages.stream,
      );

      foregroundMessages.add(
        const RemoteMessage(
          notification: RemoteNotification(
            title: 'Class Conflict Detected',
            body: 'Your manual attendance differs from EzyGo.',
          ),
        ),
      );

      // Allow microtasks and streams to complete, and pump animation
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify foreground visual banner displays correct content
      expect(find.text('Class Conflict Detected'), findsOneWidget);
      expect(
        find.text('Your manual attendance differs from EzyGo.'),
        findsOneWidget,
      );

      // Verify presence of bell icon
      expect(find.byIcon(LucideIcons.bell), findsOneWidget);

      // Tap the banner to trigger navigation
      await tester.tap(find.text('Class Conflict Detected'));
      await tester.pumpAndSettle();

      // Verify GoRouter successfully navigated to notifications route
      expect(find.text('Notifications Screen'), findsOneWidget);

      await foregroundMessages.close();
    },
  );

  test('handles FCM token refresh event and syncs with backend', () async {
    final refreshController = StreamController<String>();

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
    ).thenAnswer((_) async => 'initial-token');
    when(
      () => mockMessaging.onTokenRefresh,
    ).thenAnswer((_) => refreshController.stream);

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
    await service.initialize(registerHandlers: false);

    // Emit a refreshed token
    refreshController.add('refreshed-token');
    await Future<void>.delayed(Duration.zero);

    verify(() => mockStorage.saveFcmToken('refreshed-token')).called(1);

    await refreshController.close();
  });

  test('handles backend registration returning non-200 status code', () async {
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
    ).thenAnswer((_) async => 'new-token');
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
        statusCode: 500,
      ),
    );

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);

    // Verify that we did NOT save the token since registration failed
    verifyNever(() => mockStorage.saveFcmToken(any()));
  });

  test('handles backend registration throwing network exceptions', () async {
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
    ).thenAnswer((_) async => 'new-token');
    when(
      () => mockMessaging.onTokenRefresh,
    ).thenAnswer((_) => const Stream.empty());

    when(
      () => mockDio.post<dynamic>(
        any(),
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(DioException(requestOptions: RequestOptions()));

    final service = container.read(pushNotificationServiceProvider);
    await service.initialize(registerHandlers: false);

    // Verify no storage save occurs
    verifyNever(() => mockStorage.saveFcmToken(any()));
  });

  testWidgets('handles failures inside foreground banner display gracefully', (
    tester,
  ) async {
    final foregroundMessages = StreamController<RemoteMessage>();
    final mockGoRouter = MockGoRouter();

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
    ).thenAnswer((_) async => 'mock-fcm-token');
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

    when(
      () => mockGoRouter.routerDelegate,
    ).thenThrow(Exception('RouterDelegate crash'));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseMessagingProvider.overrideWithValue(mockMessaging),
          dioServiceProvider.overrideWithValue(mockDioService),
          secureStorageProvider.overrideWithValue(mockStorage),
          supabaseClientProvider.overrideWithValue(mockSupabase),
          routerProvider.overrideWithValue(mockGoRouter),
        ],
        child: const MaterialApp(
          home: Scaffold(body: SizedBox()),
        ),
      ),
    );

    final rootContext = tester.element(find.byType(MaterialApp));
    final container = ProviderScope.containerOf(rootContext);
    final service = container.read(pushNotificationServiceProvider);

    await service.initialize(
      registerHandlers: false,
      onMessageStream: foregroundMessages.stream,
    );

    foregroundMessages.add(
      const RemoteMessage(
        notification: RemoteNotification(
          title: 'Exception trigger',
          body: 'Should be caught safely.',
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Assert that no banner is displayed, and it completed safely without crashing the app
    expect(find.text('Exception trigger'), findsNothing);

    await foregroundMessages.close();
  });

  test('syncToken forces registration even if cached token matches', () async {
    when(() => mockMessaging.getToken()).thenAnswer((_) async => 'same-token');
    when(
      () => mockStorage.getNormalizedFcmToken(),
    ).thenAnswer((_) async => 'same-token');
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
    await service.syncToken(force: true);

    verify(
      () => mockDio.post<dynamic>(
        any(that: contains('/auth/register-fcm')),
        data: {'fcm_token': 'same-token'},
        options: any(named: 'options'),
      ),
    ).called(1);
    verify(() => mockStorage.saveFcmToken('same-token')).called(1);
  });
}
