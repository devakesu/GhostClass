import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/ezygo_batch_fetcher.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// EzygoService
/// ------------
/// Orchestrates data fetching from the EzyGo portal, utilizing batching
/// and deduplication to optimize performance and reduce backend load.
class EzygoService {
  EzygoService(this._ref) {
    _fetcher = _ref.read(ezygoBatchFetcherProvider);
  }
  final Ref _ref;
  late final EzygoBatchFetcher _fetcher;
  static final String _ezygoApiRoot = AppConfig.ezygoApiRoot;

  String _requireEzygoToken(String? token) {
    if (token == null) {
      throw const AppException(
        message: 'No EzyGo credentials found. Please log in.',
        type: AppExceptionType.unauthorized,
      );
    }
    return token;
  }

  void clearCaches() => _fetcher.clearAll();

  Future<Response<dynamic>> fetchCourses(SecureStorageService storage) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/institutionuser/courses/withusers';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<Response<dynamic>> fetchAttendanceReportDetailed(
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/attendancereports/student/detailed';
    _requireEzygoToken(token);
    return _fetcher.fetch(
      path: path,
      token: token!,
      method: 'POST',
      data: <String, dynamic>{},
    );
  }

  Future<Response<dynamic>> getInstitutions(
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/institutionusers/myinstitutions';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<Response<dynamic>> updateDefaultInstitution(
    int institutionUserId,
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    return _ref
        .read(dioServiceProvider)
        .dio
        .post(
          '$_ezygoApiRoot/user/setting/default_institutionUser',
          data: {'default_institutionUser': institutionUserId},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
            validateStatus: (s) => s != null && s < 600,
          ),
        );
  }

  Future<Response<dynamic>> updateSemester(
    String semester,
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    return _ref
        .read(dioServiceProvider)
        .dio
        .post(
          '$_ezygoApiRoot/user/setting/default_semester',
          data: {'default_semester': semester},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
            validateStatus: (s) => s != null && s < 600,
          ),
        );
  }

  Future<Response<dynamic>> updateAcademicYear(
    String year,
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    return _ref
        .read(dioServiceProvider)
        .dio
        .post(
          '$_ezygoApiRoot/user/setting/default_academic_year',
          data: {'default_academic_year': year},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
            validateStatus: (s) => s != null && s < 600,
          ),
        );
  }

  Future<Response<dynamic>> fetchSemester(SecureStorageService storage) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/user/setting/default_semester';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<Response<dynamic>> fetchAcademicYear(
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/user/setting/default_academic_year';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<dynamic> _fetchWithCache(
    String path,
    String token,
    SecureStorageService storage, {
    Duration ttl = const Duration(days: 7),
  }) async {
    final cacheKey = 'ezygo_static_${Uri.encodeFull(path)}';
    try {
      final cached = await storage.getCachedData(cacheKey);
      if (cached != null) {
        return cached;
      }
    } on Object catch (e) {
      AppLogger.w('EzygoService: Cache read error for $path: $e');
    }

    try {
      final res = await _fetcher.fetch(path: path, token: token);
      if (res.statusCode == 200) {
        await storage.saveCachedData(cacheKey, res.data, ttl: ttl);
        return res.data;
      } else {
        throw Exception('Status code: ${res.statusCode}');
      }
    } on Object catch (e) {
      AppLogger.w(
        'EzygoService: Network fetch failed for $path: $e. No stale-cache fallback is allowed.',
      );
      rethrow;
    }
  }

  Future<Response<dynamic>> fetchLeaveData(SecureStorageService storage) async {
    final token = await storage.getNormalizedEzygoToken();
    if (token == null) {
      throw const AppException(
        message: 'No EzyGo credentials found. Please log in.',
        type: AppExceptionType.unauthorized,
      );
    }

    final results = await Future.wait([
      _fetcher.fetch(path: '$_ezygoApiRoot/studentleaves', token: token),
      _fetchWithCache('$_ezygoApiRoot/usersubgroups', token, storage),
      _fetchWithCache('$_ezygoApiRoot/attendancetypes', token, storage),
      _fetchWithCache('$_ezygoApiRoot/sessions', token, storage),
      _fetchWithCache('$_ezygoApiRoot/events', token, storage),
      _fetchWithCache(
        '$_ezygoApiRoot/institution/setting/mandatory_event_coordinator',
        token,
        storage,
      ),
      _fetchWithCache(
        '$_ezygoApiRoot/institution/setting/student_leave_approval_level',
        token,
        storage,
      ),
    ]);

    final leavesRes = results[0] as Response<dynamic>;
    if (leavesRes.statusCode != 200) {
      AppLogger.e(
        'EzygoService.fetchLeaveData: Leaves request failed with ${leavesRes.statusCode}',
      );
      throw const AppException(
        message: 'Failed to fetch complete leave data. Please try again.',
        type: AppExceptionType.network,
      );
    }

    final mergedData = {
      'studentLeaves': leavesRes.data,
      'userSubgroups': results[1],
      'attendanceTypes': results[2],
      'sessions': results[3],
      'events': results[4],
      'mandatoryEventCoordinator': results[5],
      'leaveApprovalLevel': results[6],
    };

    return Response<dynamic>(
      requestOptions: leavesRes.requestOptions,
      data: mergedData,
      statusCode: 200,
    );
  }

  Future<Response<dynamic>> fetchExams(SecureStorageService storage) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/exams';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<Response<dynamic>> fetchExamQuestions(
    int examId,
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    final path =
        '$_ezygoApiRoot/exams/$examId/examquestions?from_view_score=true';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }

  Future<Response<dynamic>> fetchExamAnswers(
    int examId,
    SecureStorageService storage,
  ) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '$_ezygoApiRoot/exams/$examId/institutionuser/examanswers';
    return _fetcher.fetch(path: path, token: _requireEzygoToken(token));
  }
}

final ezygoBatchFetcherProvider = Provider<EzygoBatchFetcher>((ref) {
  // Watch supabaseUserId to automatically invalidate and recreate the fetcher on session login/logout boundaries
  ref.watch(
    authProvider.select((asyncUser) => asyncUser.value?.supabaseUserId),
  );

  final fetcher = EzygoBatchFetcher(
    ref.read(dioServiceProvider).dio,
    getOutage: () => ref.read(outageProvider),
    setOutage: (v) => ref.read(outageProvider.notifier).update(v),
    isBackendUnauthorized: () => false,
  );

  ref.onDispose(() {
    fetcher.clearAll(setOutageState: false);
  });

  return fetcher;
});

final ezygoServiceProvider = Provider<EzygoService>((ref) {
  ref.watch(ezygoBatchFetcherProvider);
  return EzygoService(ref);
});
