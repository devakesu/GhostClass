import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';

import 'package:ghostclass/services/jwe_interceptor.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:sentry_dio/sentry_dio.dart';

class DioService {
  final Ref _ref;
  late final Dio dio;
  late final Dio securityDio;
  
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  final _unauthorizedController = StreamController<void>.broadcast();
  Stream<void> get onUnauthorized => _unauthorizedController.stream;

  final _lockdownController = StreamController<Map<String, String>>.broadcast();
  Stream<Map<String, String>> get onSecurityLockdown => _lockdownController.stream;
  
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
    dio.addSentry();
    securityDio.addSentry();
    
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
          if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
            final data = e.response?.data;
            if (data is Map<String, dynamic> && data['criticalRisk'] == true) {
              AppLogger.e('DioService: CRITICAL SECURITY RISK DETECTED: ${data['error']}');
              _lockdownController.add({
                'title': data['error'] ?? 'Security Handshake Failed',
                'reason': data['reason'] ?? 'Device verification failed.',
                'action': data['action'] ?? 'Please reinstall the app.',
                'technicalDetails': 'Context: ${e.requestOptions.path}\nResponse: ${jsonEncode(data)}',
              });
              return handler.reject(e); // Stop further processing
            }
            
            if (e.response?.statusCode == 401) {
              _handle401(e.requestOptions);
            }
          }
          return handler.next(e);
        },
      ),
    );

    _ref.onDispose(() {
      _unauthorizedController.close();
      _lockdownController.close();
    });
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
              : FirebaseAppCheck.instance.getToken())
          .timeout(const Duration(seconds: 10));

      if (appCheckToken != null) {
        options.headers['X-Firebase-AppCheck'] = appCheckToken;
      }
    } catch (e) {
      AppLogger.w('DioService: Security headers failed: $e');
    }
  }
}

final dioServiceProvider = Provider<DioService>((ref) => DioService(ref));
