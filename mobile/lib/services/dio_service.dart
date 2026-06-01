import 'dart:async';
import 'package:dio/dio.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/jwe_interceptor.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:sentry_dio/sentry_dio.dart';

/// DioService
/// ----------
/// Centralized network client for the application.
///
/// Configures interceptors for JWE, Sentry, and authentication headers.
class DioService {
  DioService(this._ref) {
    const timeout = kDebugMode ? Duration(seconds: 45) : Duration(seconds: 30);

    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.ghostclassApiUrl,
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
      ),
    );

    dio.addSentry();

    // Attach JWE Layer first
    dio.interceptors.add(_ref.read(jweInterceptorProvider));

    // Auth & Security Interceptor
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.path.contains('ezygo.app')) {
            final stealthHeaders = await _ref
                .read(stealthHeadersServiceProvider)
                .getHeaders(url: options.path);
            options.headers.addAll(stealthHeaders);
          } else if (options.path.startsWith(_ghostclassBaseUrl) ||
              (!options.path.startsWith('http') &&
                  options.baseUrl == _ghostclassBaseUrl)) {
            options.headers['Accept'] = 'application/json';
            options.headers['Origin'] = AppConfig.supabaseOrigin;
            await _addSecurityHeaders(options);
          } else {
            options.headers['Accept'] = 'application/json';
          }
          return handler.next(options);
        },
        onResponse: (response, handler) {
          return handler.next(response);
        },
        onError: (err, handler) {
          try {
            if (err.response?.statusCode == 401) {
              _handle401(err.requestOptions);
            }

            // If App Check produced a local error (token issue), surface a
            // lockdown event so security flows can react (e.g. forced logout).
            final appCheckError =
                err.requestOptions.extra['appCheckError'] as String?;
            if (err.response?.statusCode == 403 && appCheckError != null) {
              AppLogger.e(
                'DioService: 403 + App Check error detected. Triggering security lockdown.',
                Exception(appCheckError),
              );
              try {
                _lockdownController.add({
                  'title': 'Device verification failed',
                  'reason': appCheckError,
                  'technicalDetails': appCheckError,
                });
              } on Object catch (e, st) {
                AppLogger.e('DioService: Failed to emit lockdown event', e, st);
              }
            }
          } on Object catch (e, st) {
            AppLogger.e('DioService: onError handler failed', e, st);
          }
          return handler.next(err);
        },
      ),
    );
  }

  final Ref _ref;
  late final Dio dio;

  FirebaseAppCheck get _appCheck => _ref.read(appCheckProvider);

  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  final _unauthorizedController = StreamController<void>.broadcast();
  final _lockdownController = StreamController<Map<String, String>>.broadcast();

  Stream<void> get onUnauthorized => _unauthorizedController.stream;
  Stream<Map<String, String>> get onSecurityLockdown =>
      _lockdownController.stream;

  bool suppress401 = false;
  DateTime? _last401Broadcast;

  // Futures to deduplicate parallel token requests
  Future<String?>? _tokenFetchInFlight;
  Future<String?>? _limitedTokenFetchInFlight;
  // Instrumentation: count how many times we requested a limited-use token
  static int _limitedTokenRequestCount = 0;
  static const int _maxAppCheckAttempts = 3;

  void _handle401(RequestOptions options) {
    if (suppress401) return;

    final now = DateTime.now();
    if (_last401Broadcast != null &&
        now.difference(_last401Broadcast!).inSeconds < 5) {
      return;
    }

    _last401Broadcast = now;
    AppLogger.d('DioService: Emitting 401 via onUnauthorized stream');
    _unauthorizedController.add(null);
  }

  bool _isTransientAppCheckFailure(Object error) {
    final msg = error.toString().toLowerCase();
    return msg.contains('too_many_attempts') ||
        msg.contains('timeout') ||
        msg.contains('network') ||
        msg.contains('connection') ||
        msg.contains('unavailable') ||
        msg.contains('rate limit') ||
        msg.contains('internal google server error') ||
        msg.contains('google_server_unavailable') ||
        msg.contains('-12');
  }

  Duration _retryDelayForAttempt(int attempt) {
    switch (attempt) {
      case 1:
        return const Duration(milliseconds: 400);
      case 2:
        return const Duration(milliseconds: 1200);
      default:
        return const Duration(milliseconds: 2500);
    }
  }

  Future<String?> _fetchAppCheckTokenWithRetry({
    required bool limited,
  }) async {
    Object? lastError;

    for (var attempt = 1; attempt <= _maxAppCheckAttempts; attempt++) {
      try {
        final tokenFuture = limited
            ? _appCheck.getLimitedUseToken()
            : _appCheck.getToken();

        return await tokenFuture.timeout(
          kDebugMode
              ? const Duration(seconds: 45)
              : const Duration(seconds: 30),
        );
      } on Object catch (e, st) {
        lastError = e;
        final isTransient = _isTransientAppCheckFailure(e);
        AppLogger.e(
          'DioService: App Check token fetch failed (limited: $limited, attempt: $attempt/$_maxAppCheckAttempts, transient: $isTransient)',
          e,
          st,
        );

        if (!isTransient || attempt >= _maxAppCheckAttempts) {
          rethrow;
        }

        await Future<void>.delayed(_retryDelayForAttempt(attempt));
      }
    }

    throw Exception('App Check token fetch failed: $lastError');
  }

  Future<void> _addSecurityHeaders(RequestOptions options) async {
    try {
      final useLimited = options.extra['useLimitedToken'] == true;

      // Deduplicate parallel token requests to prevent "Too many attempts"
      String? appCheckToken;
      if (useLimited) {
        var isNew = false;
        if (_limitedTokenFetchInFlight == null) {
          _limitedTokenRequestCount++;
          AppLogger.d(
            'DioService: getLimitedUseToken requested (count: $_limitedTokenRequestCount)',
          );
          _limitedTokenFetchInFlight = _fetchAppCheckTokenWithRetry(
            limited: true,
          );
          isNew = true;
        }
        appCheckToken = await _limitedTokenFetchInFlight!.timeout(
          kDebugMode
              ? const Duration(seconds: 45)
              : const Duration(seconds: 30),
        );
        if (isNew) {
          AppLogger.safeUnawait(
            Future.delayed(const Duration(seconds: 30), () {
              _limitedTokenFetchInFlight = null;
            }).catchError(
              (Object e, StackTrace st) {
                AppLogger.e(
                  'DioService: delayed clear of limited token fetch failed',
                  e,
                  st,
                );
              },
            ),
            'DioService: delayed clear limited token fetch',
          );
        }
      } else {
        var isNew = false;
        if (_tokenFetchInFlight == null) {
          _tokenFetchInFlight = _fetchAppCheckTokenWithRetry(
            limited: false,
          );
          isNew = true;
        }
        appCheckToken = await _tokenFetchInFlight!.timeout(
          kDebugMode
              ? const Duration(seconds: 45)
              : const Duration(seconds: 30),
        );
        if (isNew) {
          AppLogger.safeUnawait(
            Future.delayed(const Duration(seconds: 5), () {
              _tokenFetchInFlight = null;
            }).catchError(
              (Object e, StackTrace st) {
                AppLogger.e(
                  'DioService: delayed clear of token fetch failed',
                  e,
                  st,
                );
              },
            ),
            'DioService: delayed clear token fetch',
          );
        }
      }

      if (appCheckToken != null && appCheckToken.isNotEmpty) {
        options.headers['X-Firebase-AppCheck'] = appCheckToken;
        AppLogger.d(
          'DioService: App Check token attached (limited: $useLimited, length: ${appCheckToken.length})',
        );
      } else {
        const errorMsg =
            'App Check token is empty - verify Firebase activation';
        options.extra['appCheckError'] = errorMsg;
        AppLogger.e('DioService: $errorMsg');
      }
    } on Object catch (e) {
      // Ensure futures are cleared on error to allow retries
      _tokenFetchInFlight = null;
      _limitedTokenFetchInFlight = null;

      AppLogger.e('DioService: Security headers failed: $e');
      options.extra['appCheckError'] = e.toString();
      options.extra['appCheckTransient'] = _isTransientAppCheckFailure(e);
    }
  }

  Future<void> close() async {
    await _unauthorizedController.close();
    await _lockdownController.close();
    dio.close();
  }
}

final dioServiceProvider = Provider<DioService>(DioService.new);

final appCheckProvider = Provider<FirebaseAppCheck>(
  (ref) => FirebaseAppCheck.instance,
);

final jweInterceptorProvider = Provider<JweInterceptor>(
  (ref) => JweInterceptor(),
);
