import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/logic/ezygo_batch_fetcher.dart';
import 'package:ghostclass/providers/outage_provider.dart';

/// EzygoService
/// ------------
/// Orchestrates data fetching from the EzyGo portal, utilizing batching
/// and deduplication to optimize performance and reduce backend load.
class EzygoService {
  final Ref _ref;
  late final EzygoBatchFetcher _fetcher;
  static final String _ezygoApiRoot = AppConfig.ezygoApiRoot;

  EzygoService(this._ref) {
    _fetcher = EzygoBatchFetcher(
      _ref.read(dioServiceProvider).dio,
      getOutage: () => _ref.read(outageProvider),
      setOutage: (v) => _ref.read(outageProvider.notifier).update(v),
      isBackendUnauthorized: () => false, 
    );
  }

  void clearCaches() => _fetcher.clearAll();

  Future<Response<dynamic>> fetchCourses(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/institutionuser/courses/withusers';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> fetchAttendanceReportDetailed(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/attendancereports/student/detailed';
    if (token == null) {
      return _ref.read(dioServiceProvider).dio.post(
        path,
        data: {},
      );
    }
    return _fetcher.fetch(
      path: path,
      token: token,
      method: 'POST',
      data: {},
    );
  }

  Future<Response<dynamic>> getInstitutions(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/institutionusers/myinstitutions';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> updateDefaultInstitution(int institutionUserId, SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    return _ref.read(dioServiceProvider).dio.post(
      '$_ezygoApiRoot/user/setting/default_institutionUser',
      data: {'default_institutionUser': institutionUserId},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> updateSemester(String semester, SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    return _ref.read(dioServiceProvider).dio.post(
      '$_ezygoApiRoot/user/setting/default_semester',
      data: {'default_semester': semester},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> updateAcademicYear(String year, SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    return _ref.read(dioServiceProvider).dio.post(
      '$_ezygoApiRoot/user/setting/default_academic_year',
      data: {'default_academic_year': year},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> fetchSemester(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/user/setting/default_semester';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> fetchAcademicYear(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/user/setting/default_academic_year';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> fetchLeaveData(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    if (token == null) {
      throw AppException(
        message: 'No EzyGo credentials found. Please log in.',
        type: AppExceptionType.unauthorized,
      );
    }

    // 7-way concurrent fetch to match monolithic parity
    final results = await Future.wait([
      _fetcher.fetch(path: '$_ezygoApiRoot/studentleaves', token: token),
      _fetcher.fetch(path: '$_ezygoApiRoot/usersubgroups', token: token),
      _fetcher.fetch(path: '$_ezygoApiRoot/attendancetypes', token: token),
      _fetcher.fetch(path: '$_ezygoApiRoot/sessions', token: token),
      _fetcher.fetch(path: '$_ezygoApiRoot/events', token: token),
      _fetcher.fetch(
        path: '$_ezygoApiRoot/institution/setting/mandatory_event_coordinator',
        token: token,
      ),
      _fetcher.fetch(
        path: '$_ezygoApiRoot/institution/setting/student_leave_approval_level',
        token: token,
      ),
    ]);

    // Construct a merged response data map matching the original structure
    final mergedData = {
      'studentLeaves': results[0].data,
      'userSubgroups': results[1].data,
      'attendanceTypes': results[2].data,
      'sessions': results[3].data,
      'events': results[4].data,
      'mandatoryEventCoordinator': results[5].data,
      'studentLeaveApprovalLevel': results[6].data,
    };

    return Response(
      requestOptions: results[0].requestOptions,
      data: mergedData,
      statusCode: 200,
    );
  }

  Future<Response<dynamic>> fetchExams(SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/exams';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> fetchExamQuestions(int examId, SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/exams/$examId/examquestions?from_view_score=true';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }

  Future<Response<dynamic>> fetchExamAnswers(int examId, SecureStorageService storage) async {
    final token = await storage.getEzygoToken();
    final path = '$_ezygoApiRoot/exams/$examId/institutionuser/examanswers';
    if (token == null) return _ref.read(dioServiceProvider).dio.get(path);
    return _fetcher.fetch(path: path, token: token);
  }
}

final ezygoServiceProvider = Provider<EzygoService>((ref) => EzygoService(ref));
