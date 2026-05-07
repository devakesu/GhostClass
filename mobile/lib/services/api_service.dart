import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_play_integrity_wrapper/flutter_play_integrity_wrapper.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/config/app_secrets.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/ezygo_batch_fetcher.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/services/jwe_interceptor.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class ApiService {
  final Ref _ref;
  late final Dio _dio;
  late final Dio _securityDio;
  late final EzygoBatchFetcher _fetcher;
  final _unauthorizedController = StreamController<void>.broadcast();

  // Create an instance of the wrapper
  final _playIntegrity = FlutterPlayIntegrityWrapper();
  static final String _cloudProjectNumber =
      AppConfig.firebaseCloudProjectNumber;

  // Cache for Play Integrity tokens to prevent per-request latency
  String? _cachedIntegrityToken;
  DateTime? _integrityTokenTimestamp;
  static const _tokenTTL = Duration(minutes: 3);

  // Deduplication for background sync tasks
  Future<Response<dynamic>>? _syncInFlight;
  DateTime? _lastSyncTime;
  static const _syncCooldown = Duration(seconds: 30);
  final Duration _networkTimeout;
  DateTime? _last401Broadcast;
  bool _backendUnauthorized = false;

  /// Stream of 401 Unauthorized events from EzyGo.
  Stream<void> get onUnauthorized => _unauthorizedController.stream;

  /// Whether to suppress the onUnauthorized broadcast (used during self-healing).
  bool suppress401 = false;

  /// Returns whether the backend is currently reporting App Check failures.
  bool get isBackendUnauthorized => _backendUnauthorized;

  /// GhostClass web app's API origin. Token bridge lives here.
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  /// The EzyGo authentication endpoint (direct, no proxy needed for mobile).
  static String get _ezygoLoginUrl => AppConfig.ezygoAuthUrl;

  /// The EzyGo Base API root.
  static String get _ezygoApiRoot => AppConfig.ezygoApiRoot;


  /// Generates a secure random nonce of at least 16 bytes for Play Integrity.
  /// Note: This is a fallback if the server nonce fetch fails.
  String _generateLocalNonce() {
    final random = Random.secure();
    final values = List<int>.generate(32, (i) => random.nextInt(256));
    return base64Url.encode(values).replaceAll('=', '');
  }

  /// Fetches a one-time nonce from the GhostClass server for Play Integrity.
  /// Security Practice 1: Integrity Nonces (Server-provided)
  Future<String> _fetchServerNonce() async {
    try {
      final response = await _securityDio.get(
        '$_ghostclassBaseUrl/security/nonce',
      );
      if (response.statusCode == 200) {
        return response.data['nonce'] as String;
      }
    } catch (e) {
      AppLogger.w(
        'ApiService: Server nonce fetch failed, falling back to local.',
      );
    }
    return _generateLocalNonce();
  }

  /// Clears all local network and data caches (EzygoBatchFetcher, sync throttling, etc).
  void clearCaches() {
    _fetcher.clearAll();
    _lastSyncTime = null;
    AppLogger.i('ApiService: All local caches cleared.');
  }

  void _setSecurityFailure({
    required String message,
    bool criticalRisk = false,
    String? reason,
    String? action,
    String source = 'backend',
  }) {
    _ref.read(securityFailureProvider.notifier).setFailure(
          message,
          criticalRisk: criticalRisk,
          reason: reason,
          action: action,
          source: source,
        );
  }

  ApiService(this._ref)
      : _networkTimeout = kDebugMode ? const Duration(seconds: 40) : const Duration(seconds: 20) {
    _dio = Dio(
      BaseOptions(
        connectTimeout: _networkTimeout,
        receiveTimeout: _networkTimeout,
        sendTimeout: _networkTimeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ),
    );

    // Create a clean Dio instance for internal security calls to avoid recursion
    _securityDio = Dio(
      BaseOptions(
        connectTimeout: _networkTimeout,
        receiveTimeout: _networkTimeout,
        sendTimeout: _networkTimeout,
      ),
    );

    if (kDebugMode) {
      (_securityDio.httpClientAdapter as IOHttpClientAdapter).createHttpClient =
          () {
            final client = HttpClient();
            client.badCertificateCallback =
                (X509Certificate cert, String host, int port) => true;
            return client;
          };
    }

    // Handle 401 Unauthorized globally
    _dio.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) {
          if (response.statusCode == 401) {
            final isLoginRequest =
                response.requestOptions.path.contains('/login') ||
                response.requestOptions.path.contains('/save-token');

            final isEzygoRequest = response.requestOptions.path.contains(
              'ezygo.app',
            );
            if (isEzygoRequest && !isLoginRequest && !suppress401) {
              final now = DateTime.now();
              if (_last401Broadcast == null ||
                  now.difference(_last401Broadcast!) >
                      const Duration(seconds: 2)) {
                _last401Broadcast = now;
                AppLogger.w(
                  'ApiService: Core 401 DETECTED for ${response.requestOptions.path}. Broadcasting onUnauthorized.',
                );
                _unauthorizedController.add(null);
              }
            }

            final isGhostclassRequest = response.requestOptions.path.startsWith(
              _ghostclassBaseUrl,
            );

            // Handle GhostClass Backend 401s (Security/App Check Failure)
            if (isGhostclassRequest && !isLoginRequest && !suppress401) {
              final errorMsg = response.data is Map
                  ? response.data['error']?.toString()
                  : null;
              final isAppCheckFailure =
                  errorMsg?.contains('App Check') == true ||
                  errorMsg?.contains('integrity') == true ||
                  errorMsg?.contains('Unauthenticated') == true;

              if (isAppCheckFailure) {
                _backendUnauthorized = true;
                final data = response.data as Map<String, dynamic>?;
                final isSecurityPayload = data != null && data['type'] == 'security';
                final reason = data?['reason']?.toString();
                final action = data?['action']?.toString();
                final criticalRisk = data?['criticalRisk'] == true;
                final friendlyMsg = isSecurityPayload
                    ? '${reason ?? errorMsg ?? 'Device verification failed'}\n\n${action ?? 'Please try again later.'}'
                    : errorMsg ?? 'Device verification failed';

                _setSecurityFailure(
                  message: friendlyMsg,
                  criticalRisk: criticalRisk,
                  reason: reason,
                  action: action,
                  source: 'backend',
                );
                AppLogger.e(
                  'ApiService: SECURITY FAILURE (App Check) for ${response.requestOptions.path}',
                );
                _unauthorizedController.add(
                  null,
                ); // Trigger healing/logout logic
              }
            }
          } else if (response.statusCode == 200 &&
              response.requestOptions.path.startsWith(_ghostclassBaseUrl)) {
            // Success! Reset security lock
            if (_backendUnauthorized) {
              _backendUnauthorized = false;
              _ref.read(securityFailureProvider.notifier).clearFailure();
              AppLogger.i(
                'ApiService: Security lock cleared via successful request.',
              );
            }
          }
          return handler.next(response);
        },
        onError: (DioException e, handler) {
          if (e.response?.statusCode == 401) {
            final isLoginRequest =
                e.requestOptions.path.contains('/login') ||
                e.requestOptions.path.contains('/save-token');

            final isEzygoRequest = e.requestOptions.path.contains('ezygo.app');
            if (isEzygoRequest && !isLoginRequest && !suppress401) {
              final now = DateTime.now();
              if (_last401Broadcast == null ||
                  now.difference(_last401Broadcast!) >
                      const Duration(seconds: 2)) {
                _last401Broadcast = now;
                AppLogger.e(
                  'ApiService: Core 401 ERROR DETECTED for ${e.requestOptions.path}. Broadcasting onUnauthorized.',
                  e,
                );
                _unauthorizedController.add(null);
              }
            }

            // Handle GhostClass Backend 401 Errors
            final isGhostclassRequest = e.requestOptions.path.startsWith(
              _ghostclassBaseUrl,
            );
            if (isGhostclassRequest && !isLoginRequest && !suppress401) {
              final responseData = e.response?.data;
              final errorMsg = responseData is Map
                  ? responseData['error']?.toString()
                  : null;
              final isAppCheckFailure =
                  errorMsg?.contains('App Check') == true ||
                  errorMsg?.contains('integrity') == true ||
                  errorMsg?.contains('Unauthenticated') == true;

              if (isAppCheckFailure) {
                _backendUnauthorized = true;
                final data = responseData as Map<String, dynamic>?;
                final isSecurityPayload = data != null && data['type'] == 'security';
                final reason = data?['reason']?.toString();
                final action = data?['action']?.toString();
                final criticalRisk = data?['criticalRisk'] == true;
                final friendlyMsg = isSecurityPayload
                    ? '${reason ?? errorMsg ?? 'Device verification failed'}\n\n${action ?? 'Please try again later.'}'
                    : errorMsg ?? 'Device verification failed';

                _setSecurityFailure(
                  message: friendlyMsg,
                  criticalRisk: criticalRisk,
                  reason: reason,
                  action: action,
                  source: 'backend',
                );
                AppLogger.e(
                  'ApiService: SECURITY ERROR (App Check) for ${e.requestOptions.path}',
                );
                _unauthorizedController.add(null);
              }
            }
          }

          // Add breadcrumb for the network error
          Sentry.addBreadcrumb(
            Breadcrumb(
              message: 'Network Error: ${e.type}',
              category: 'api',
              level: SentryLevel.error,
              data: {
                'path': e.requestOptions.path,
                'status': e.response?.statusCode,
                'message': e.message,
              },
            ),
          );

          return handler.next(e);
        },
      ),
    );

    /* 
    // Sentry Dio Interceptor (Automatic performance and breadcrumb tracking)
    _dio.addSentry(
      captureFailedRequests: true,
    );
    */

    // JWE (JSON Web Encryption) Interceptor
    // This MUST come before other interceptors that work with bodies
    _dio.interceptors.add(JweInterceptor(_ref));

    // Stealth Headers Interceptor
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.path.contains('ezygo.app')) {
            final stealthHeaders = await _ref
                .read(stealthHeadersServiceProvider)
                .getHeaders(url: options.path);
            options.headers.addAll(stealthHeaders);

            // Block EzyGo requests if backend is unauthorized (Security Lock)
            if (_backendUnauthorized) {
              return handler.reject(
                DioException(
                  requestOptions: options,
                  type: DioExceptionType.cancel,
                  message: 'Security Verification Required',
                ),
              );
            }
          } else if (options.path.startsWith(_ghostclassBaseUrl)) {
            options.headers['Accept'] = 'application/json';
            options.headers['origin'] = AppSecrets.supabaseSpoofedOrigin;

            // Note: Firebase App Check and Play Integrity are still added
            // even if the body is JWE-encrypted.
            try {
              // 1. Firebase App Check (Standard dynamic token)
              final useLimited = options.extra['useLimitedToken'] == true;
              final appCheckToken = useLimited
                  ? await FirebaseAppCheck.instance.getLimitedUseToken()
                  : await FirebaseAppCheck.instance.getToken();

              if (appCheckToken != null) {
                options.headers['X-Firebase-AppCheck'] = appCheckToken;
              }

              // 2. Play Integrity (Android-specific deep attestation)
              if (!kIsWeb && Platform.isAndroid) {
                try {
                  final now = DateTime.now();
                  final useLimited = options.extra['useLimitedToken'] == true;

                  // Only use cache if NOT a limited use request
                  if (!useLimited &&
                      _cachedIntegrityToken != null &&
                      _integrityTokenTimestamp != null &&
                      now.difference(_integrityTokenTimestamp!) < _tokenTTL) {
                    options.headers['X-Play-Integrity'] = _cachedIntegrityToken;
                  } else {
                    final String? integrityToken = await _playIntegrity
                        .requestIntegrityToken(
                          cloudProjectNumber: _cloudProjectNumber,
                          nonce: await _fetchServerNonce(),
                        );
                    if (integrityToken != null) {
                      _cachedIntegrityToken = integrityToken;
                      _integrityTokenTimestamp = now;
                      options.headers['X-Play-Integrity'] = integrityToken;
                    }
                  }
                } catch (e) {
                  rethrow;
                }
              }
            } catch (e) {
              if (kDebugMode) {
                AppLogger.w('ApiService: Security attestation failed.');
                rethrow;
              } else {
                AppLogger.e('ApiService: Security attestation failed.', e);
                rethrow;
              }
            }
          } else {
            options.headers['Accept'] = 'application/json';
          }
          return handler.next(options);
        },
      ),
    );

    // Global DNS Shield is now active via HttpOverrides in main.dart

    _fetcher = EzygoBatchFetcher(
      _dio,
      getOutage: () => _ref.read(outageProvider),
      setOutage: (v) => _ref.read(outageProvider.notifier).update(v),
      isBackendUnauthorized: () => _backendUnauthorized,
    );
  }

  Dio get client => _dio;

  /// Proactively fetches security tokens to hide startup latency
  Future<void> preWarm() async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      // Add a timeout to ensure background attestation doesn't hang the caller
      final String? integrityToken = await _playIntegrity
          .requestIntegrityToken(
            cloudProjectNumber: _cloudProjectNumber,
            nonce: await _fetchServerNonce(),
              )
              .timeout(_networkTimeout);

      if (integrityToken != null) {
        _cachedIntegrityToken = integrityToken;
        _integrityTokenTimestamp = DateTime.now();
      }
    } catch (e) {
      // Background attestation failures on emulators are expected and handled gracefully
    }
  }

  // ─── EzyGo Direct Auth ────────────────────────────────────────────────────

  Future<Response<dynamic>> loginAndProvision({
    required String username,
    required String password,
  }) async {
    // 1. Login to EzyGo
      final ezygoResponse = await loginEzygo(username, password).timeout(
      _networkTimeout,
      onTimeout: () => throw AppException(
        message: 'Login timeout to EzyGo portal',
        type: AppExceptionType.network,
      ),
    );

    if (ezygoResponse.statusCode != 200) return ezygoResponse;

    final ezygoToken =
        ezygoResponse.data['token'] ?? ezygoResponse.data['access_token'];
    if (ezygoToken?.toString().isEmpty ?? true) {
      throw AppException(
        message: 'Portal returned no token.',
        type: AppExceptionType.unauthorized,
      );
    }

    // 2. Provision session in GhostClass bridge
    try {
      final ghostResponse = await provisionGhostClassSession(
        ezygoToken,
      ).timeout(_networkTimeout);
      return ghostResponse;
    } on TimeoutException {
      throw AppException(
        message: 'Session provisioning timed out',
        type: AppExceptionType.network,
      );
    } catch (e) {
      AppLogger.e(
        'ApiService: GhostClass provisioning failed during login.',
        e,
      );
      rethrow;
    }
  }

  Future<Response<dynamic>> loginEzygo(String username, String password) async {
    if (username.trim().isEmpty || password.trim().isEmpty) {
      throw DioException(
        requestOptions: RequestOptions(path: _ezygoLoginUrl),
        error: 'Username and password cannot be empty',
        type: DioExceptionType.badResponse,
      );
    }

    return _dio.post(
      _ezygoLoginUrl,
      data: {
        'username': username.trim(),
        'password': password.trim(),
        'stay_logged_in': true,
      },
      options: Options(validateStatus: (s) => s != null && s < 600),
    );
  }

  // ─── GhostClass Auth Bridge ───────────────────────────────────────────────

  Future<Response<dynamic>> provisionGhostClassSession(
    String ezygoToken,
  ) async {
    if (ezygoToken.trim().length < 18) {
      throw DioException(
        requestOptions: RequestOptions(
          path: '$_ghostclassBaseUrl/auth/save-token',
        ),
        error: 'Invalid token format',
        type: DioExceptionType.badResponse,
      );
    }

    return _dio.post(
      '$_ghostclassBaseUrl/auth/save-token',
      data: {'token': ezygoToken.trim()},
      options: Options(
        extra: {'useLimitedToken': true}, // Enable Replay Protection (Nonce)
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> refreshProfile(
    String supabaseToken, {
    bool sync = false,
  }) async {
    return _dio.get(
      '$_ghostclassBaseUrl/user/profile',
      queryParameters: sync ? {'sync': 'true'} : null,
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> syncMobileAuth(String supabaseToken) async {
    return _dio.post(
      '$_ghostclassBaseUrl/auth/sync',
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> updateProfile(
    String supabaseToken,
    Map<String, dynamic> data,
  ) async {
    return _dio.patch(
      '$_ghostclassBaseUrl/profile',
      data: data,
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> addCourse({
    required String courseCode,
    required String courseName,
    required String semester,
    required String academicYear,
    required String supabaseToken,
  }) async {
    return _dio.post(
      '$_ghostclassBaseUrl/courses/add',
      data: {
        'courseCode': courseCode,
        'courseName': courseName,
        'semester': semester,
        'academicYear': academicYear,
      },
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> acceptTerms(
    String supabaseToken,
    String version,
  ) async {
    return _dio.post(
      '$_ghostclassBaseUrl/user/accept-terms',
      data: {'version': version},
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> submitContact({
    required String name,
    required String email,
    required String subject,
    required String message,
    String? supabaseToken,
  }) async {
    return _dio.post(
      '$_ghostclassBaseUrl/contact',
      data: {
        'name': name,
        'email': email,
        'subject': subject,
        'message': message,
      },
      options: Options(
        headers: {
          if (supabaseToken != null) 'Authorization': 'Bearer $supabaseToken',
        },
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> fetchAttestationDetails([
    String? supabaseToken,
  ]) async {
    return _dio.get(
      '$_ghostclassBaseUrl/security/attestation',
      options: Options(
        headers: {
          if (supabaseToken != null) 'Authorization': 'Bearer $supabaseToken',
        },
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  /// Performs a full server-side integrity check.
  /// Throws a security-typed AppException if verification fails.
  Future<void> verifyIntegrity() async {
    try {
      final response = await fetchAttestationDetails();
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        final bool verified = data['verified'] ?? false;

        if (!verified) {
          final String reason = data['reason'] ?? data['playIntegrityError'] ?? data['appCheckError'] ?? 'Device integrity check failed.';
          final String action = data['action'] ?? 'Please ensure you are using a genuine version of GhostClass from the Play Store.';
          final bool criticalRisk = data['criticalRisk'] == true;

          throw AppException(
            message: reason,
            type: AppExceptionType.unauthorized,
            details: {
              'type': 'security',
              'reason': reason,
              'action': action,
              'criticalRisk': criticalRisk,
            },
          );
        }
      } else {
        // Handle 401 or other errors from the security endpoint
        final data = response.data as Map<String, dynamic>?;
        if (data != null && data['type'] == 'security') {
          throw AppException(
            message: data['error'] ?? 'Security handshake failed',
            type: AppExceptionType.unauthorized,
            details: data,
          );
        }
        throw AppException(
          message: 'Security verification unavailable (${response.statusCode})',
          type: AppExceptionType.server,
        );
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        final data = e.response?.data as Map<String, dynamic>?;
        if (data != null && data['type'] == 'security') {
          throw AppException(
            message: data['error'] ?? 'Security handshake failed',
            type: AppExceptionType.unauthorized,
            details: data,
          );
        }
      }
      rethrow;
    }
  }

  // ─── Authenticated EzyGo Requests ─────────────────────────────────────────

  Future<Response<dynamic>> getInstitutions(
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    final url = '$_ezygoApiRoot/institutionusers/myinstitutions';

    if (token == null) return _dio.get(url);

    return _fetcher.fetch(path: url, token: token);
  }

  Future<Response<dynamic>> updateDefaultInstitution(
    int institutionUserId,
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    return _dio.post(
      '$_ezygoApiRoot/user/setting/default_institutionUser',
      data: {'default_institutionUser': institutionUserId},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> getUser(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    if (token == null) return _dio.get('$_ezygoApiRoot/user');

    return _fetcher.fetch(path: '$_ezygoApiRoot/user', token: token);
  }

  Future<Response<dynamic>> fetchCourses(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    if (token == null) {
      return _dio.get('$_ezygoApiRoot/institutionuser/courses/withusers');
    }

    return _fetcher.fetch(
      path: '$_ezygoApiRoot/institutionuser/courses/withusers',
      token: token,
    );
  }

  Future<Response<dynamic>> fetchSemester(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    if (token == null) {
      return _dio.get('$_ezygoApiRoot/user/setting/default_semester');
    }

    return _fetcher.fetch(
      path: '$_ezygoApiRoot/user/setting/default_semester',
      token: token,
    );
  }

  Future<Response<dynamic>> fetchAcademicYear(
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    if (token == null) {
      return _dio.get('$_ezygoApiRoot/user/setting/default_academic_year');
    }

    return _fetcher.fetch(
      path: '$_ezygoApiRoot/user/setting/default_academic_year',
      token: token,
    );
  }

  Future<Response<dynamic>> updateSemester(
    String semester,
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    return _dio.post(
      '$_ezygoApiRoot/user/setting/default_semester',
      data: {'default_semester': semester},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> updateAcademicYear(
    String year,
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    return _dio.post(
      '$_ezygoApiRoot/user/setting/default_academic_year',
      data: {'default_academic_year': year},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> ezygoGet(
    String path,
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    if (token == null) return _dio.get(path);

    return _fetcher.fetch(path: path, token: token);
  }

  // ─── Leave Applications ───────────────────────────────────────────────────

  Future<Map<String, dynamic>> fetchLeaveData(
    SecureStorageService storage,
  ) async {
    final results = await Future.wait([
      ezygoGet('$_ezygoApiRoot/studentleaves', storage),
      ezygoGet('$_ezygoApiRoot/usersubgroups', storage),
      ezygoGet('$_ezygoApiRoot/attendancetypes', storage),
      ezygoGet('$_ezygoApiRoot/sessions', storage),
      ezygoGet('$_ezygoApiRoot/events', storage),
      ezygoGet(
        '$_ezygoApiRoot/institution/setting/mandatory_event_coordinator',
        storage,
      ),
      ezygoGet(
        '$_ezygoApiRoot/institution/setting/student_leave_approval_level',
        storage,
      ),
    ]);

    return {
      'studentLeaves': results[0].data,
      'userSubgroups': results[1].data,
      'attendanceTypes': results[2].data,
      'sessions': results[3].data,
      'events': results[4].data,
      'mandatoryEventCoordinator': results[5].data,
      'leaveApprovalLevel': results[6].data,
    };
  }

  // ─── Internal Marks (Scores) ──────────────────────────────────────────────

  /// Fetches the base list of exams for the student.
  Future<Response<dynamic>> fetchExams(SecureStorageService storage) async {
    return ezygoGet('$_ezygoApiRoot/exams', storage);
  }

  /// Fetches the student's answers (marks) for a specific exam.
  /// Correct path: /exams/{id}/institutionuser/examanswers
  Future<Response<dynamic>> fetchExamAnswers(
    int examId,
    SecureStorageService storage,
  ) async {
    return ezygoGet(
      '$_ezygoApiRoot/exams/$examId/institutionuser/examanswers',
      storage,
    );
  }

  /// Fetches the question metadata for a specific exam.
  /// Correct path: /exams/{id}/examquestions?from_view_score=true
  Future<Response<dynamic>> fetchExamQuestions(
    int examId,
    SecureStorageService storage,
  ) async {
    return ezygoGet(
      '$_ezygoApiRoot/exams/$examId/examquestions?from_view_score=true',
      storage,
    );
  }

  // ─── Attendance Tracking ──────────────────────────────────────────────────

  /// Fetches the detailed official attendance report from EzyGo.
  Future<Response<dynamic>> fetchAttendanceReportDetailed(
    SecureStorageService storage,
  ) async {
    final token = await storage.getEzygoToken();
    if (token == null) {
      return _dio.post(
        '$_ezygoApiRoot/attendancereports/student/detailed',
        data: {},
      );
    }

    return _fetcher.fetch(
      path: '$_ezygoApiRoot/attendancereports/student/detailed',
      token: token,
      method: 'POST',
      data: {},
    );
  }

  /// Triggers the GhostClass background sync for the current user.
  /// Deduplicates concurrent requests and throttles triggers within 30 seconds.
  Future<Response<dynamic>> triggerSync(String supabaseToken) async {
    // 1. Deduplication: If a sync is already happening, return the existing future
    if (_syncInFlight != null) return _syncInFlight!;

    // Bail early if we are in a hard outage lock to avoid redundant noise
    if (_ref.read(outageProvider)) {
      AppLogger.d(
        'ApiService: Skipping background sync due to EzyGo outage lock.',
      );
      return Future.value(
        Response(
          requestOptions: RequestOptions(path: 'sync'),
          statusCode: 503,
          statusMessage: 'Outage active. Press retry to recover.',
        ),
      );
    }

    // 2. Throttling: If we synced very recently, skip.
    final now = DateTime.now();
    if (_lastSyncTime != null &&
        now.difference(_lastSyncTime!) < _syncCooldown) {
      AppLogger.d(
        'ApiService: Sync throttled (last sync was ${now.difference(_lastSyncTime!).inSeconds}s ago).',
      );
      return Response(
        requestOptions: RequestOptions(path: '$_ghostclassBaseUrl/cron/sync'),
        statusCode: 304, // Not Modified (Effectively skipped)
        data: {'message': 'Throttled'},
      );
    }

    _syncInFlight = _dio.get(
      '$_ghostclassBaseUrl/cron/sync?t=${now.millisecondsSinceEpoch}',
      options: Options(
        headers: {
          'Authorization': 'Bearer $supabaseToken',
        },
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );

    try {
      final response = await _syncInFlight!;
      if (response.statusCode == 200 || response.statusCode == 201) {
        _lastSyncTime = DateTime.now();
      }
      return response;
    } on DioException catch (e) {
      AppLogger.e('ApiService: Background sync failed.', e);
      // We don't rethrow here for background sync calls to avoid crashing the caller's
      // async closure (e.g. NavigationShell retry) which might be waiting on this.
      // The provider itself will handle the error state.
      return Response(
        requestOptions: e.requestOptions,
        statusCode: e.response?.statusCode ?? 500,
        statusMessage: e.message,
      );
    } finally {
      _syncInFlight = null;
    }
  }

  /// Maps a [DioException] to a user-friendly [AppException].
  AppException mapDioError(DioException e) {
    String message = 'Unexpected error occurred.';
    AppExceptionType type = AppExceptionType.unknown;

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        message = 'Connection timed out. Check your internet.';
        type = AppExceptionType.network;
        break;
      case DioExceptionType.connectionError:
        if (e.error is SocketException) {
          final se = e.error as SocketException;
          if (se.message.contains('Failed host lookup')) {
            message =
                'Server address could not be resolved. Please check your DNS or ISP blocks.';
            AppLogger.e(
              'ApiService DNS Failure: ${se.message} (address: ${se.address})',
            );
          } else {
            message = 'Network connection failed: ${se.message}';
          }
        } else {
          message = 'No internet connection.';
        }
        type = AppExceptionType.network;
        break;
      case DioExceptionType.badResponse:
        final status = e.response?.statusCode;
        type = AppExceptionType.server;
        if (status == 401) {
          message = 'Session expired. Please log in again.';
          type = AppExceptionType.unauthorized;
        } else if (status == 403) {
          message = 'Access denied. Bridge security attestation failed.';
          type = AppExceptionType.forbidden;
        } else if (status == 429) {
          message =
              'Woah, slow down! EzyGo rate limited your request. Please wait a minute before trying again.';
          type = AppExceptionType.rateLimit;
        } else if (status == 503) {
          message =
              'EzyGo is currently undergoing maintenance or is overloaded. Please try again later.';
          type = AppExceptionType.server;
        } else if (status == 502 || status == 504) {
          message =
              'The server is currently unreachable. This is likely a temporary network issue.';
          type = AppExceptionType.network;
        } else if (status == 500) {
          message = 'EzyGo is having technical issues (Internal Server Error).';
          type = AppExceptionType.server;
        }

        break;
      default:
        message = e.message ?? 'Unknown network error.';
        break;
    }

    return AppException(
      message: message,
      type: type,
      originalError: e,
      statusCode: e.response?.statusCode,
    );
  }
}

final apiServiceProvider = Provider<ApiService>((ref) => ApiService(ref));
