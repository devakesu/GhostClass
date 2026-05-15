// Service is dynamically resolved or used in background isolates
// ignore_for_file: unreachable_from_main

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// Top-level background message handler for FCM.
/// Must be a standalone function to run in a separate isolate.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('Handling a background message: ${message.messageId}');
}

/// PushNotificationService
/// -----------------------
/// Initializes Firebase Cloud Messaging (FCM), requests native permissions,
/// manages foreground/background dispatchers, and synchronises device tokens
/// with the secure GhostClass backend app-check guarded routes.
final firebaseMessagingProvider = Provider<FirebaseMessaging>(
  (ref) => FirebaseMessaging.instance,
);

class PushNotificationService {
  PushNotificationService(this._ref)
    : _messaging = _ref.read(firebaseMessagingProvider);
  final Ref _ref;
  final FirebaseMessaging _messaging;
  StreamSubscription<String>? _tokenSub;

  Dio get _dio => _ref.read(dioServiceProvider).dio;
  SecureStorageService get _storage => _ref.read(secureStorageProvider);

  /// Initializes FCM listeners, requests push permissions, sets up isolates,
  /// and synchronises the active device push token.
  Future<void> initialize({
    bool registerHandlers = true,
    Stream<RemoteMessage>? onMessageStream,
    Stream<RemoteMessage>? onMessageOpenedAppStream,
  }) async {
    try {
      // Request permissions natively on iOS and Android targets
      final settings = await _messaging.requestPermission();

      AppLogger.i(
        'PushNotificationService: Authorization status: ${settings.authorizationStatus}',
      );

      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        if (registerHandlers) {
          // Register top-level isolate background event handler
          FirebaseMessaging.onBackgroundMessage(
            _firebaseMessagingBackgroundHandler,
          );
        }

        // Listen for active app foreground message streams
        (onMessageStream ?? FirebaseMessaging.onMessage).listen((message) {
          AppLogger.d(
            'Received foreground message: ${message.notification?.title}',
          );
          try {
            unawaited(
              AnalyticsService.instance.logCustom(
                'fcm_foreground_received',
                {
                  'title': message.notification?.title ?? '',
                  'has_data': message.data.isNotEmpty,
                },
              ),
            );
          } on Object catch (_) {}
        });

        // Track when user taps a notification to open the app
        (onMessageOpenedAppStream ?? FirebaseMessaging.onMessageOpenedApp)
            .listen((message) {
              AppLogger.i('User opened app from notification');
              try {
                unawaited(
                  AnalyticsService.instance.logCustom(
                    'fcm_opened',
                    {
                      'title': message.notification?.title ?? '',
                      'has_data': message.data.isNotEmpty,
                    },
                  ),
                );
              } on Object catch (_) {}
            });

        // Retrieve token and execute initial synchronization
        final token = await _messaging.getToken();
        if (token != null) {
          await _syncTokenWithBackend(token);
          try {
            unawaited(
              AnalyticsService.instance.logCustom('fcm_token_retrieved', {
                'length': token.length,
              }),
            );
          } on Object catch (_) {}
        }

        // Establish ongoing refresh listener for security token rotations
        _tokenSub = _messaging.onTokenRefresh.listen((newToken) {
          AppLogger.i('FCM device token refreshed');
          unawaited(_syncTokenWithBackend(newToken));
        });
      }
    } on Object catch (e, st) {
      AppLogger.e(
        'PushNotificationService: Initialization sequence failed',
        e,
        st,
      );
    }
  }

  /// Synchronises the secure push token with the backend storage route.
  Future<void> _syncTokenWithBackend(String token) async {
    try {
      final cachedToken = await _storage.getFcmToken();
      final currentSession = _ref
          .read(supabaseClientProvider)
          .auth
          .currentSession;

      // Avoid repeating network handshakes if token remains unchanged or session is inactive
      if (cachedToken == token || currentSession == null) {
        return;
      }

      final accessToken = currentSession.accessToken;
      final baseUrl = AppConfig.ghostclassApiUrl;

      final response = await _dio.post<dynamic>(
        '$baseUrl/auth/register-fcm',
        data: {'fcm_token': token.trim()},
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
          extra: {'useLimitedToken': true},
          validateStatus: (s) => s != null && s < 600,
        ),
      );

      if (response.statusCode == 200) {
        AppLogger.i('FCM push token securely registered with backend services');
        await _storage.saveFcmToken(token);
        try {
          unawaited(
            AnalyticsService.instance.logCustom('fcm_registered', {
              'registered': true,
            }),
          );
        } on Object catch (_) {}
      } else {
        AppLogger.w(
          'Backend token registration returned non-success code: ${response.statusCode}',
        );
        try {
          unawaited(
            AnalyticsService.instance.logCustom('fcm_registered', {
              'registered': false,
              'status': response.statusCode,
            }),
          );
        } on Object catch (_) {}
      }
    } on Object catch (e) {
      AppLogger.w('FCM backend token attestation/handshake failure', e);
      try {
        unawaited(
          AnalyticsService.instance.logCustom('fcm_registered', {
            'registered': false,
            'error': e.toString(),
          }),
        );
      } on Object catch (_) {}
    }
  }

  Future<void> dispose() async {
    await _tokenSub?.cancel();
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>(
  PushNotificationService.new,
);
