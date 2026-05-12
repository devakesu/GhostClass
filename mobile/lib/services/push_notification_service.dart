import 'dart:async';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/providers/auth_provider.dart';

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
final firebaseMessagingProvider = Provider<FirebaseMessaging>((ref) => FirebaseMessaging.instance);

class PushNotificationService {
  final Ref _ref;
  final FirebaseMessaging _messaging;
  StreamSubscription<String>? _tokenSub;

  PushNotificationService(this._ref)
      : _messaging = _ref.read(firebaseMessagingProvider);

  Dio get _dio => _ref.read(dioServiceProvider).dio;
  SecureStorageService get _storage => _ref.read(secureStorageProvider);

  /// Initializes FCM listeners, requests push permissions, sets up isolates,
  /// and synchronises the active device push token.
  Future<void> initialize({bool registerHandlers = true}) async {
    try {
      // Request permissions natively on iOS and Android targets
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      AppLogger.i('PushNotificationService: Authorization status: ${settings.authorizationStatus}');

      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        
        if (registerHandlers) {
          // Register top-level isolate background event handler
          FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

          // Listen for active app foreground message streams
          FirebaseMessaging.onMessage.listen((RemoteMessage message) {
            AppLogger.d('Received foreground message: ${message.notification?.title}');
          });
        }

        // Retrieve token and execute initial synchronization
        final token = await _messaging.getToken();
        if (token != null) {
          await _syncTokenWithBackend(token);
        }

        // Establish ongoing refresh listener for security token rotations
        _tokenSub = _messaging.onTokenRefresh.listen((newToken) {
          AppLogger.i('FCM device token refreshed');
          _syncTokenWithBackend(newToken);
        });
      }
    } catch (e, st) {
      AppLogger.e('PushNotificationService: Initialization sequence failed', e, st);
    }
  }

  /// Synchronises the secure push token with the backend storage route.
  Future<void> _syncTokenWithBackend(String token) async {
    try {
      final cachedToken = await _storage.getFcmToken();
      final currentSession = _ref.read(supabaseClientProvider).auth.currentSession;

      // Avoid repeating network handshakes if token remains unchanged or session is inactive
      if (cachedToken == token || currentSession == null) {
        return;
      }

      final accessToken = currentSession.accessToken;
      final baseUrl = AppConfig.ghostclassApiUrl;

      final response = await _dio.post(
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
      } else {
        AppLogger.w('Backend token registration returned non-success code: ${response.statusCode}');
      }
    } catch (e) {
      AppLogger.w('FCM backend token attestation/handshake failure', e);
    }
  }

  void dispose() {
    _tokenSub?.cancel();
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) => PushNotificationService(ref));
