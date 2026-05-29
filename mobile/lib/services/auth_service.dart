import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// AuthService
/// -----------
/// Handles authentication logic, including EzyGo login, session provisioning
/// with the GhostClass backend, and user profile management.
class AuthService {
  AuthService(this._ref);
  final Ref _ref;
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;
  static final String _ezygoAuthUrl = AppConfig.ezygoAuthUrl;

  Dio get _dio => _ref.read(dioServiceProvider).dio;

  Future<Response<dynamic>> loginAndProvision({
    required String username,
    required String password,
  }) async {
    final ezygoResponse = await loginEzygo(username, password);
    if (ezygoResponse.statusCode != 200) return ezygoResponse;

    final data = ezygoResponse.data as Map<String, dynamic>?;
    final rawToken = data?['token'] ?? data?['access_token'];
    final ezygoToken = rawToken is String ? rawToken : rawToken?.toString();
    if (ezygoToken == null || ezygoToken.trim().isEmpty) {
      throw const AppException(
        message: 'Portal returned no token.',
        type: AppExceptionType.unauthorized,
      );
    }

    return provisionGhostClassSession(ezygoToken);
  }

  Future<Response<dynamic>> loginEzygo(String username, String password) async {
    return _dio.post(
      _ezygoAuthUrl,
      data: {
        'username': username.trim(),
        'password': password,
        'stay_logged_in': true,
      },
      options: Options(validateStatus: (s) => s != null && s < 600),
    );
  }

  Future<Response<dynamic>> provisionGhostClassSession(
    String ezygoToken,
  ) async {
    return _dio.post(
      '$_ghostclassBaseUrl/auth/save-token',
      data: {'token': ezygoToken.trim()},
      options: Options(
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> refreshProfile(
    String supabaseToken, {
    bool sync = false,
    bool force = false,
  }) async {
    final params = <String, String>{};
    if (sync) params['sync'] = 'true';
    if (force) params['force'] = 'true';

    return _dio.get(
      '$_ghostclassBaseUrl/profile',
      queryParameters: params.isNotEmpty ? params : null,
      options: Options(
        headers: {'Authorization': 'Bearer $supabaseToken'},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  Future<Response<dynamic>> syncMobileAuth(String supabaseToken) async {
    return _dio.post(
      '$_ghostclassBaseUrl/auth/sync',
      options: Options(
        headers: {'Authorization': 'Bearer $supabaseToken'},
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
        headers: {'Authorization': 'Bearer $supabaseToken'},
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
        headers: {'Authorization': 'Bearer $supabaseToken'},
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

  Future<Response<dynamic>> getUser(SecureStorageService storage) async {
    final token = await storage.getNormalizedEzygoToken();
    final path = '${AppConfig.ezygoApiRoot}/user';
    if (token == null) return _dio.get(path);
    return _dio.get(
      path,
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
  }
}

final authServiceProvider = Provider<AuthService>(AuthService.new);
