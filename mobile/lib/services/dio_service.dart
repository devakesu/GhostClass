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
    const timeout = kDebugMode ? Duration(seconds: 40) : Duration(seconds: 20);

    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.ghostclassApiUrl,
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
      ),
    );

    securityDio = Dio(
      BaseOptions(
        baseUrl: AppConfig.ghostclassApiUrl,
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
      ),
    );

    dio.addSentry();
    securityDio.addSentry();

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
          if (err.response?.statusCode == 401) {
            _handle401(err.requestOptions);
          }
          return handler.next(err);
        },
      ),
    );
  }

  final Ref _ref;
  late final Dio dio;
  late final Dio securityDio;

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

  void _handle401(RequestOptions options) {
    if (suppress401) return;

    final now = DateTime.now();
    if (_last401Broadcast != null &&
        now.difference(_last401Broadcast!).inSeconds < 5) {
      return;
    }

    _last401Broadcast = now;
    _unauthorizedController.add(null);
  }

  Future<void> _addSecurityHeaders(RequestOptions options) async {
    try {
      final useLimited = options.extra['useLimitedToken'] == true;

      // Deduplicate parallel token requests to prevent "Too many attempts"
      String? appCheckToken;
      if (useLimited) {
        _limitedTokenFetchInFlight ??= _appCheck.getLimitedUseToken();
        appCheckToken = await _limitedTokenFetchInFlight!.timeout(
          const Duration(seconds: 10),
        );
        _limitedTokenFetchInFlight = null; // Clear after completion
      } else {
        _tokenFetchInFlight ??= _appCheck.getToken();
        appCheckToken = await _tokenFetchInFlight!.timeout(
          const Duration(seconds: 10),
        );
        _tokenFetchInFlight = null; // Clear after completion
      }

      if (appCheckToken != null && appCheckToken.isNotEmpty) {
        options.headers['X-Firebase-AppCheck'] = appCheckToken;
      } else {
        options.extra['appCheckError'] =
            'App Check token is empty - verify Firebase activation';
      }
    } on Object catch (e) {
      // Ensure futures are cleared on error to allow retries
      _tokenFetchInFlight = null;
      _limitedTokenFetchInFlight = null;

      AppLogger.w('DioService: Security headers failed: $e');
      options.extra['appCheckError'] = e.toString();
    }
  }

  Future<void> close() async {
    await _unauthorizedController.close();
    await _lockdownController.close();
    dio.close();
    securityDio.close();
  }
}

final dioServiceProvider = Provider<DioService>(DioService.new);

final appCheckProvider = Provider<FirebaseAppCheck>(
  (ref) => FirebaseAppCheck.instance,
);

final jweInterceptorProvider = Provider<JweInterceptor>(
  (ref) => JweInterceptor(),
);
