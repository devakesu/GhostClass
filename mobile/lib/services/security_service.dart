import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/dio_service.dart';

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
        throw AppException(
          message: 'Security verification unavailable',
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
