import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/services/auth_service.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/ezygo_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// ApiService
/// ----------
/// A centralized facade for accessing specialized API services (Auth, EzyGo, Security).
/// This service acts as the primary entry point for network-related logic in the app.
class ApiService {
  final Ref _ref;

  ApiService(this._ref);

  AuthService get _auth => _ref.read(authServiceProvider);
  EzygoService get _ezygo => _ref.read(ezygoServiceProvider);
  SecurityService get _security => _ref.read(securityServiceProvider);
  DioService get _dioService => _ref.read(dioServiceProvider);

  Stream<void> get onUnauthorized => _dioService.onUnauthorized;
  Stream<Map<String, String>> get onSecurityLockdown => _dioService.onSecurityLockdown;
  bool get suppress401 => _dioService.suppress401;
  set suppress401(bool v) => _dioService.suppress401 = v;

  Dio get client => _dioService.dio;

  // --- GhostClass Sync State ---
  Future<Response<dynamic>>? _syncInFlight;
  DateTime? _lastSyncTime;
  static const _syncCooldown = Duration(minutes: 5);

  void clearCaches() => _ezygo.clearCaches();

  Future<void> preWarm() async {
    // Basic pre-warm handled by individual services on demand
  }

  // --- Authentication ---
  Future<Response<dynamic>> loginAndProvision({required String username, required String password}) =>
      _auth.loginAndProvision(username: username, password: password);

  Future<Response<dynamic>> loginEzygo(String username, String password) =>
      _auth.loginEzygo(username, password);

  Future<Response<dynamic>> provisionGhostClassSession(String ezygoToken) =>
      _auth.provisionGhostClassSession(ezygoToken);

  Future<Response<dynamic>> refreshProfile(String supabaseToken, {bool sync = false}) =>
      _auth.refreshProfile(supabaseToken, sync: sync);

  Future<Response<dynamic>> syncMobileAuth(String supabaseToken) =>
      _auth.syncMobileAuth(supabaseToken);

  Future<Response<dynamic>> updateProfile(String supabaseToken, Map<String, dynamic> data) =>
      _auth.updateProfile(supabaseToken, data);

  Future<Response<dynamic>> acceptTerms(String supabaseToken, String version) =>
      _auth.acceptTerms(supabaseToken, version);

  Future<Response<dynamic>> submitContact({
    required String name,
    required String email,
    required String subject,
    required String message,
    String? supabaseToken,
  }) =>
      _auth.submitContact(name: name, email: email, subject: subject, message: message, supabaseToken: supabaseToken);

  Future<Response<dynamic>> getUser(SecureStorageService storage) => _auth.getUser(storage);

  // --- Academic Data (EzyGo) ---
  Future<Response<dynamic>> fetchCourses(SecureStorageService storage) => _ezygo.fetchCourses(storage);
  Future<Response<dynamic>> fetchAttendanceReportDetailed(SecureStorageService storage) =>
      _ezygo.fetchAttendanceReportDetailed(storage);
  Future<Response<dynamic>> getInstitutions(SecureStorageService storage) => _ezygo.getInstitutions(storage);
  Future<Response<dynamic>> updateDefaultInstitution(int institutionUserId, SecureStorageService storage) =>
      _ezygo.updateDefaultInstitution(institutionUserId, storage);
  Future<Response<dynamic>> updateSemester(String semester, SecureStorageService storage) =>
      _ezygo.updateSemester(semester, storage);
  Future<Response<dynamic>> updateAcademicYear(String year, SecureStorageService storage) =>
      _ezygo.updateAcademicYear(year, storage);
  Future<Response<dynamic>> fetchSemester(SecureStorageService storage) => _ezygo.fetchSemester(storage);
  Future<Response<dynamic>> fetchAcademicYear(SecureStorageService storage) => _ezygo.fetchAcademicYear(storage);
  Future<Response<dynamic>> fetchLeaveData(SecureStorageService storage) => _ezygo.fetchLeaveData(storage);
  Future<Response<dynamic>> fetchExams(SecureStorageService storage) => _ezygo.fetchExams(storage);
  Future<Response<dynamic>> fetchExamQuestions(int examId, SecureStorageService storage) => _ezygo.fetchExamQuestions(examId, storage);
  Future<Response<dynamic>> fetchExamAnswers(int examId, SecureStorageService storage) => _ezygo.fetchExamAnswers(examId, storage);

  // --- Device & Network Security ---
  Future<void> verifyIntegrity() => _security.verifyIntegrity();
  Future<Response<dynamic>> fetchAttestationDetails([String? supabaseToken]) => _security.fetchAttestationDetails(supabaseToken);

  // --- Data Synchronization ---
  Future<Response<dynamic>> triggerSync(String supabaseToken, {bool force = false}) async {
    // 1. Deduplication
    if (_syncInFlight != null) return _syncInFlight!;

    // 2. Circuit Breaker
    final outage = _ref.read(outageProvider);
    if (outage) {
      AppLogger.d('ApiService: Skipping sync due to active outage.');
      return Response(
        requestOptions: RequestOptions(path: 'sync'),
        statusCode: 503,
        statusMessage: 'Outage active.',
      );
    }

    // 3. Throttling
    final now = DateTime.now();
    if (!force && _lastSyncTime != null && now.difference(_lastSyncTime!) < _syncCooldown) {
      AppLogger.d('ApiService: Sync throttled.');
      return Response(
        requestOptions: RequestOptions(path: 'sync'),
        statusCode: 304,
        data: {'message': 'Throttled'},
      );
    }

    _syncInFlight = () async {
      try {
        final response = await client.get(
          '${AppConfig.ghostclassApiUrl}/cron/sync?t=${now.millisecondsSinceEpoch}',
          options: Options(
            headers: {'Authorization': 'Bearer $supabaseToken'},
            extra: {'useLimitedToken': true},
            sendTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
          ),
        );
        _lastSyncTime = DateTime.now();
        return response;
      } catch (e) {
        AppLogger.w('ApiService: Background sync failed', e);
        // Return a mock 304 to let downstream continue without hanging
        return Response(
          requestOptions: RequestOptions(path: 'sync'),
          statusCode: 304,
        );
      } finally {
        _syncInFlight = null;
      }
    }();

    return _syncInFlight!;
  }

  Future<Response<dynamic>> addCourse({
    required String courseCode,
    required String courseName,
    required String semester,
    required String academicYear,
    required String supabaseToken,
  }) async {
    return client.post(
      '${AppConfig.ghostclassApiUrl}/courses/add',
      data: {
        'courseCode': courseCode,
        'courseName': courseName,
        'semester': semester,
        'academicYear': academicYear,
      },
      options: Options(headers: {'Authorization': 'Bearer $supabaseToken'}),
    );
  }

  // --- Error Handling ---
  AppException mapDioError(DioException e) {
    final status = e.response?.statusCode;
    var type = AppExceptionType.network;
    var message = formatApiError(e.response?.data, 'ApiService.Dio');

    if (status != null) {
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
    }

    final appCheckError = e.requestOptions.extra['appCheckError'];

    return AppException(
      message: message,
      type: type,
      originalError: e,
      statusCode: status,
      details: {
        'appCheckError': appCheckError,
        if (e.requestOptions.path.contains('/security/')) 'type': 'security',
      },
    );
  }
}

final apiServiceProvider = Provider<ApiService>((ref) => ApiService(ref));
