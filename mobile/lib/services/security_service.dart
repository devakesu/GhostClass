import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';

/// SecurityService
/// ---------------
/// Manages device integrity checks and security attestation with the GhostClass backend.
class SecurityService {
  final Ref _ref;
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  SecurityService(this._ref);

  Dio get _dio => _ref.read(dioServiceProvider).dio;

  Future<void> verifyIntegrity() async {
    try {
      final response = await _dio.get(
        '$_ghostclassBaseUrl/security/attestation',
        options: Options(extra: {'useLimitedToken': true}),
      );
      
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        if (data['verified'] != true) {
          final String reason = data['reason'] ?? data['appCheckError'] ?? 'Device integrity check failed.';
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
        throw AppException(
          message: 'Security verification unavailable',
          type: AppExceptionType.server,
        );
      }
    } on DioException catch (e) {
      final appCheckError = e.requestOptions.extra['appCheckError'];

      if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
        final data = e.response?.data as Map<String, dynamic>?;
        final isSecurityType = data != null && data['type'] == 'security';
        final backendReason = data?['reason'] ?? data?['error'] ?? data?['appCheckError'];

        if (isSecurityType || appCheckError != null) {
          final action = data?['action'] ?? 'Please ensure your device is not rooted, you are using the official app, and you have a stable internet connection.';

          throw AppException(
            message: appCheckError != null 
                ? 'Device verification failed: $appCheckError'
                : (backendReason ?? 'Security verification failed'),
            type: AppExceptionType.unauthorized,
            details: {
              ...?data,
              'type': 'security',
              'reason': appCheckError ?? backendReason ?? 'App attestation failed',
              'appCheckError': appCheckError,
              'action': action,
            },
          );
        }
      }
      rethrow;
    }
  }

  Future<Response<dynamic>> fetchAttestationDetails([String? supabaseToken]) async {
    return _dio.get(
      '$_ghostclassBaseUrl/security/attestation',
      options: Options(
        headers: {if (supabaseToken != null) 'Authorization': 'Bearer $supabaseToken'},
        extra: {'useLimitedToken': true},
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }
}

final securityServiceProvider = Provider<SecurityService>((ref) => SecurityService(ref));
