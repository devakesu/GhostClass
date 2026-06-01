// Service is dynamically resolved or used in background isolates
// ignore_for_file: unreachable_from_main

import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
  StreamSubscription<RemoteMessage>? _messageSub;
  StreamSubscription<RemoteMessage>? _messageOpenedSub;
  StreamSubscription<AuthState>? _deferredAuthSub;
  Timer? _deferredAuthTimer;

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
      await _tokenSub?.cancel();
      await _messageSub?.cancel();
      await _messageOpenedSub?.cancel();
      await _deferredAuthSub?.cancel();
      _deferredAuthTimer?.cancel();
      _deferredAuthSub = null;
      _deferredAuthTimer = null;
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

        // Configure native iOS foreground notifications
        AppLogger.safeUnawait(
          _messaging
              .setForegroundNotificationPresentationOptions(
                alert: true,
                badge: true,
                sound: true,
              )
              .catchError(
                (Object e, StackTrace st) => AppLogger.e(
                  'PushNotificationService: Failed to set foreground presentation options',
                  e,
                  st,
                ),
              ),
          'PushNotificationService: set foreground presentation options',
        );

        // Listen for active app foreground message streams
        _messageSub = (onMessageStream ?? FirebaseMessaging.onMessage).listen((
          message,
        ) {
          AppLogger.d(
            'Received foreground message: ${message.notification?.title}',
          );
          try {
            AppLogger.safeUnawait(
              AnalyticsService.instance
                  .logCustom(
                    'fcm_foreground_received',
                    {
                      'title': message.notification?.title ?? '',
                      'has_data': message.data.isNotEmpty,
                    },
                  )
                  .catchError(
                    (Object e, StackTrace st) => AppLogger.e(
                      'PushNotificationService: Analytics fcm_foreground_received failed',
                      e,
                      st,
                    ),
                  ),
              'PushNotificationService: analytics fcm_foreground_received',
            );
          } on Object catch (_) {}

          // Display visual in-app banner for both Android and iOS
          final notification = message.notification;
          if (notification != null && notification.title != null) {
            try {
              final router = _ref.read(routerProvider);
              final context = router
                  .routerDelegate
                  .navigatorKey
                  .currentState
                  ?.overlay
                  ?.context;
              if (context != null && context.mounted) {
                SchedulerBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) {
                    ServiceToast.showNotification(
                      context,
                      title: notification.title!,
                      body: notification.body ?? '',
                      onTap: () {
                        router.go('/notifications');
                      },
                    );
                  }
                });
              }
            } on Object catch (e) {
              AppLogger.e(
                'Failed to display foreground service notification toast',
                e,
              );
            }
          }
        });

        // Track when user taps a notification to open the app
        _messageOpenedSub =
            (onMessageOpenedAppStream ?? FirebaseMessaging.onMessageOpenedApp)
                .listen((message) {
                  AppLogger.i('User opened app from notification');
                  try {
                    AppLogger.safeUnawait(
                      AnalyticsService.instance
                          .logCustom(
                            'fcm_opened',
                            {
                              'title': message.notification?.title ?? '',
                              'has_data': message.data.isNotEmpty,
                            },
                          )
                          .catchError(
                            (Object e, StackTrace st) => AppLogger.e(
                              'PushNotificationService: Analytics fcm_opened failed',
                              e,
                              st,
                            ),
                          ),
                      'PushNotificationService: analytics fcm_opened',
                    );
                  } on Object catch (_) {}
                });

        // Retrieve token and execute initial synchronization
        final token = await _messaging.getToken();
        if (token != null) {
          // Defer backend sync slightly to avoid competing with critical
          // startup/login security handshakes.
          AppLogger.safeUnawait(
            Future<void>.delayed(
              Platform.environment.containsKey('FLUTTER_TEST')
                  ? Duration.zero
                  : const Duration(seconds: 8),
              () async {
                await _syncTokenWithBackend(token);
              },
            ).catchError((Object e, StackTrace st) {
              AppLogger.e(
                'PushNotificationService: deferred initial FCM sync failed',
                e,
                st,
              );
            }),
            'PushNotificationService: deferred initial FCM sync',
          );
          try {
            AppLogger.safeUnawait(
              AnalyticsService.instance
                  .logCustom('fcm_token_retrieved', {
                    'length': token.length,
                  })
                  .catchError(
                    (Object e, StackTrace st) => AppLogger.e(
                      'PushNotificationService: Analytics fcm_token_retrieved failed',
                      e,
                      st,
                    ),
                  ),
              'PushNotificationService: analytics fcm_token_retrieved',
            );
          } on Object catch (_) {}
        }

        // Establish ongoing refresh listener for security token rotations
        _tokenSub = _messaging.onTokenRefresh.listen((newToken) {
          AppLogger.i('FCM device token refreshed');
          AppLogger.safeUnawait(
            _syncTokenWithBackend(newToken),
            'FCM token refresh',
          );
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
      if (!_ref.mounted) return;
      final cachedToken = await _storage.getNormalizedFcmToken();

      if (cachedToken == token) {
        return;
      }

      if (!_ref.mounted) return;
      final supabase = _ref.read(supabaseClientProvider);
      final currentSession = supabase.auth.currentSession;

      // If there is no active session, schedule a one-shot listener to attempt
      // registration when a session becomes available. This avoids silently
      // dropping device tokens that arrived before login.
      if (currentSession == null) {
        await _deferredAuthSub?.cancel();
        _deferredAuthTimer?.cancel();

        // Defensive timeout: if the user never signs in, cancel the listener
        // after a reasonable period to avoid resource leaks.
        _deferredAuthSub = supabase.auth.onAuthStateChange.listen((data) async {
          final session = data.session;
          if (session != null) {
            try {
              final accessToken = session.accessToken;
              final response = await _registerTokenHttp(token, accessToken);
              if (response.statusCode == 200) {
                AppLogger.i('FCM push token registered on auth event');
                try {
                  await _storage.saveFcmToken(token);
                } on Object catch (e, st) {
                  AppLogger.e(
                    'PushNotificationService: saveFcmToken failed on auth event',
                    e,
                    st,
                  );
                }
                try {
                  AppLogger.safeUnawait(
                    AnalyticsService.instance
                        .logCustom('fcm_registered', {
                          'registered': true,
                        })
                        .catchError(
                          (Object e, StackTrace st) => AppLogger.e(
                            'PushNotificationService: Analytics fcm_registered (deferred) failed',
                            e,
                            st,
                          ),
                        ),
                    'PushNotificationService: analytics fcm_registered (deferred)',
                  );
                } on Object catch (_) {}
              } else {
                AppLogger.e(
                  'FCM registration on auth event returned ${response.statusCode}',
                );
              }
            } on Object catch (e) {
              AppLogger.e('FCM deferred registration failed', e);
            } finally {
              await _deferredAuthSub?.cancel();
              _deferredAuthSub = null;
              _deferredAuthTimer?.cancel();
              _deferredAuthTimer = null;
            }
          }
        });

        // Cancel the subscription after 5 minutes if no session event occurs.
        _deferredAuthTimer = Timer(const Duration(minutes: 5), () async {
          AppLogger.d('FCM deferred registration listener timeout; cancelling');
          await _deferredAuthSub?.cancel();
          _deferredAuthSub = null;
          _deferredAuthTimer = null;
        });

        return;
      }

      final accessToken = currentSession.accessToken;
      final response = await _registerTokenHttp(token, accessToken);

      if (response.statusCode == 200) {
        AppLogger.i('FCM push token securely registered with backend services');
        try {
          await _storage.saveFcmToken(token);
        } on Object catch (e, st) {
          AppLogger.e('PushNotificationService: saveFcmToken failed', e, st);
        }
        try {
          AppLogger.safeUnawait(
            AnalyticsService.instance
                .logCustom('fcm_registered', {
                  'registered': true,
                })
                .catchError(
                  (Object e, StackTrace st) => AppLogger.e(
                    'PushNotificationService: Analytics fcm_registered failed',
                    e,
                    st,
                  ),
                ),
            'PushNotificationService: analytics fcm_registered',
          );
        } on Object catch (_) {}
      } else {
        AppLogger.e(
          'Backend token registration returned non-success code: ${response.statusCode}',
        );
        try {
          AppLogger.safeUnawait(
            AnalyticsService.instance
                .logCustom('fcm_registered', {
                  'registered': false,
                  'status': response.statusCode,
                })
                .catchError(
                  (Object e, StackTrace st) => AppLogger.e(
                    'PushNotificationService: Analytics fcm_registered (failure) failed',
                    e,
                    st,
                  ),
                ),
            'PushNotificationService: analytics fcm_registered (failure)',
          );
        } on Object catch (_) {}
      }
    } on Object catch (e) {
      AppLogger.e('FCM backend token attestation/handshake failure', e);
      try {
        AppLogger.safeUnawait(
          AnalyticsService.instance
              .logCustom('fcm_registered', {
                'registered': false,
                'error': e.toString(),
              })
              .catchError(
                (Object e, StackTrace st) => AppLogger.e(
                  'PushNotificationService: Analytics fcm_registered (exception) failed',
                  e,
                  st,
                ),
              ),
          'PushNotificationService: analytics fcm_registered (exception)',
        );
      } on Object catch (_) {}
    }
  }

  Future<Response<dynamic>> _registerTokenHttp(
    String token,
    String accessToken,
  ) {
    final baseUrl = AppConfig.ghostclassApiUrl;
    return _dio.post<dynamic>(
      '$baseUrl/auth/register-fcm',
      data: {'fcm_token': token.trim()},
      options: Options(
        headers: {'Authorization': 'Bearer $accessToken'},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  void dispose() {
    unawaited(_tokenSub?.cancel());
    unawaited(_messageSub?.cancel());
    unawaited(_messageOpenedSub?.cancel());
    unawaited(_deferredAuthSub?.cancel());
    _deferredAuthTimer?.cancel();
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>(
  (ref) {
    final service = PushNotificationService(ref);
    ref.onDispose(service.dispose);
    return service;
  },
);
