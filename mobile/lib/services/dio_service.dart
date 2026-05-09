import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';

import 'package:ghostclass/services/jwe_interceptor.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_play_integrity_wrapper/flutter_play_integrity_wrapper.dart';
import 'package:ghostclass/services/logger.dart';

class DioService {
  final Ref _ref;
  late final Dio dio;
  late final Dio securityDio;
  
  final _playIntegrity = FlutterPlayIntegrityWrapper();
  static final String _cloudProjectNumber = AppConfig.firebaseCloudProjectNumber;
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  String? _cachedIntegrityToken;
  DateTime? _integrityTokenTimestamp;
  static const _tokenTTL = Duration(minutes: 3);

  final _unauthorizedController = StreamController<void>.broadcast();
  Stream<void> get onUnauthorized => _unauthorizedController.stream;
  
  bool suppress401 = false;
  DateTime? _last401Broadcast;

  DioService(this._ref) {
    final timeout = kDebugMode ? const Duration(seconds: 40) : const Duration(seconds: 20);
    
    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.ghostclassApiUrl,
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ),
    );

    securityDio = Dio(
      BaseOptions(
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
      ),
    );

    if (kDebugMode) {
      (securityDio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
        final client = HttpClient();
        client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
        return client;
      };
    }

    dio.interceptors.add(JweInterceptor(_ref));
    
    // Auth & Security Interceptor
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.path.contains('ezygo.app')) {
            final stealthHeaders = await _ref
                .read(stealthHeadersServiceProvider)
                .getHeaders(url: options.path);
            options.headers.addAll(stealthHeaders);
          } else if (options.path.startsWith(_ghostclassBaseUrl)) {
            options.headers['Accept'] = 'application/json';
            options.headers['Origin'] = AppConfig.supabaseOrigin;
            await _addSecurityHeaders(options);
          } else {
            options.headers['Accept'] = 'application/json';
          }
          return handler.next(options);
        },
        onResponse: (response, handler) {
          if (response.statusCode == 401) {
            _handle401(response.requestOptions);
          }
          return handler.next(response);
        },
        onError: (DioException e, handler) {
          if (e.response?.statusCode == 401) {
            _handle401(e.requestOptions);
          }
          return handler.next(e);
        },
      ),
    );
  }

  void _handle401(RequestOptions options) {
    if (suppress401) return;
    
    final isLoginRequest = options.path.contains('/login') || options.path.contains('/save-token');
    if (isLoginRequest) return;

    final now = DateTime.now();
    if (_last401Broadcast == null || now.difference(_last401Broadcast!) > const Duration(seconds: 2)) {
      _last401Broadcast = now;
      AppLogger.w('DioService: 401 detected for ${options.path}. Broadcasting onUnauthorized.');
      _unauthorizedController.add(null);
    }
  }

  Future<void> _addSecurityHeaders(RequestOptions options) async {
    try {
      final useLimited = options.extra['useLimitedToken'] == true;
      final appCheckToken = await (useLimited
          ? FirebaseAppCheck.instance.getLimitedUseToken()
          : FirebaseAppCheck.instance.getToken()).timeout(const Duration(seconds: 10));

      if (appCheckToken != null) {
        options.headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      if (!kIsWeb && Platform.isAndroid) {
        final now = DateTime.now();
        if (!useLimited &&
            _cachedIntegrityToken != null &&
            _integrityTokenTimestamp != null &&
            now.difference(_integrityTokenTimestamp!) < _tokenTTL) {
          options.headers['X-Play-Integrity'] = _cachedIntegrityToken;
        } else {
          try {
            final String? integrityToken = await _playIntegrity.requestIntegrityToken(
              cloudProjectNumber: _cloudProjectNumber,
              nonce: await _fetchServerNonce(),
            ).timeout(const Duration(seconds: 15));
            if (integrityToken != null) {
              _cachedIntegrityToken = integrityToken;
              _integrityTokenTimestamp = now;
              options.headers['X-Play-Integrity'] = integrityToken;
            }
          } catch (e) {
            final errorStr = e.toString();
            // Fallback to cached token for specific "soft" errors:
            // -8: Integrity API error (-8): Internal error (often transient)
            // -3: Integrity API error (-3): Network error (connection to Google servers)
            // -12: Integrity API error (-12): Quota exceeded
            if (errorStr.contains('-8') || errorStr.contains('-3') || errorStr.contains('-12')) {
              AppLogger.w('DioService: Play Integrity soft failure ($e). Using cached token.');
              if (_cachedIntegrityToken != null) {
                options.headers['X-Play-Integrity'] = _cachedIntegrityToken;
              }
            } else {
              rethrow;
            }
          }
        }
      }
    } catch (e) {
      AppLogger.w('DioService: Security headers failed: $e');
    }
  }

  Future<String> _fetchServerNonce() async {
    try {
      final response = await securityDio.get('$_ghostclassBaseUrl/security/nonce');
      if (response.statusCode == 200) {
        return response.data['nonce'] as String;
      }
    } catch (_) {}
    return _generateLocalNonce();
  }

  String _generateLocalNonce() {
    final random = Random.secure();
    final values = List<int>.generate(32, (i) => random.nextInt(256));
    return base64Url.encode(values).replaceAll('=', '');
  }
}

final dioServiceProvider = Provider<DioService>((ref) => DioService(ref));
