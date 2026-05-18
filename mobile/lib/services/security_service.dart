import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/services/dio_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

class AppVersionCheckResult {
  AppVersionCheckResult({
    required this.latestVersion,
    required this.minVersion,
    required this.hasUpdate,
    required this.isForceUpdate,
  });

  final String latestVersion;
  final String minVersion;
  final bool hasUpdate;
  final bool isForceUpdate;
}

/// SecurityService
/// ---------------
/// Manages device integrity checks and security attestation with the GhostClass backend.
class SecurityService {
  SecurityService(this._ref);
  final Ref _ref;
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;

  Dio get _dio => _ref.read(dioServiceProvider).dio;

  bool _isVersionOlder(String current, String target) {
    final currentParts = current
        .split('.')
        .map((e) => int.tryParse(e) ?? 0)
        .toList();
    final targetParts = target
        .split('.')
        .map((e) => int.tryParse(e) ?? 0)
        .toList();

    for (var i = 0; i < 3; i++) {
      final currentPart = currentParts.length > i ? currentParts[i] : 0;
      final targetPart = targetParts.length > i ? targetParts[i] : 0;

      if (currentPart < targetPart) return true;
      if (currentPart > targetPart) return false;
    }
    return false;
  }

  Future<AppVersionCheckResult?> verifyIntegrity() async {
    final storage = _ref.read(secureStorageProvider);
    final cachedRaw = await storage.getAttestationResult();

    if (cachedRaw != null) {
      try {
        final map = jsonDecode(cachedRaw) as Map<String, dynamic>;
        final cachedResult = AppVersionCheckResult(
          latestVersion: map['latestVersion'] as String,
          minVersion: map['minVersion'] as String,
          hasUpdate: map['hasUpdate'] as bool,
          isForceUpdate: map['isForceUpdate'] as bool,
        );

        // Run background verification asynchronously
        unawaited(_runBackgroundIntegrityCheck());

        AppLogger.d('SecurityService: Returned cached attestation check.');
        return cachedResult;
      } on Object catch (e) {
        AppLogger.w('SecurityService: Failed to parse cached attestation', e);
      }
    }

    // Cache miss / first run: Blocking network attestation
    final result = await _performNetworkVerify();
    if (result != null) {
      await _cacheAttestationResult(result);
    }
    return result;
  }

  Future<void> _cacheAttestationResult(AppVersionCheckResult result) async {
    try {
      final storage = _ref.read(secureStorageProvider);
      final map = {
        'latestVersion': result.latestVersion,
        'minVersion': result.minVersion,
        'hasUpdate': result.hasUpdate,
        'isForceUpdate': result.isForceUpdate,
      };
      await storage.saveAttestationResult(jsonEncode(map));
      AppLogger.d('SecurityService: Cached attestation check result.');
    } on Object catch (e) {
      AppLogger.w('SecurityService: Failed to write attestation cache', e);
    }
  }

  Future<void> _runBackgroundIntegrityCheck() async {
    try {
      final result = await _performNetworkVerify();
      if (result != null) {
        await _cacheAttestationResult(result);

        // Update the reactive update state
        _ref.read(appUpdateProvider.notifier).setCheckResult(result);
      }
    } on AppException catch (e) {
      if (e.details?['type'] == 'security') {
        AppLogger.e(
          'SecurityService: Background attestation failure detected.',
        );
        _ref
            .read(securityFailureProvider.notifier)
            .setFailure(
              e.message,
              criticalRisk: e.details?['criticalRisk'] == true,
              reason: e.details?['reason'] as String?,
              action: e.details?['action'] as String?,
              source: 'BackgroundAttestation',
            );
      } else {
        AppLogger.w(
          'SecurityService: Background check AppException ignored',
          e,
        );
      }
    } on Object catch (e) {
      // Offline/DioException is caught here and safely ignored for background checks
      AppLogger.d(
        'SecurityService: Background attestation network error ignored',
        e,
      );
    }
  }

  Future<AppVersionCheckResult?> _performNetworkVerify() async {
    try {
      final response = await _dio.get<dynamic>(
        '$_ghostclassBaseUrl/security/attestation',
        options: Options(extra: {'useLimitedToken': true}),
      );

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        if (data['verified'] != true) {
          final reason =
              (data['reason'] as String?) ??
              (data['appCheckError'] as String?) ??
              'Device integrity check failed.';
          final action =
              (data['action'] as String?) ??
              'Please ensure you are using a genuine version of GhostClass from the Play Store.';
          final criticalRisk = data['criticalRisk'] == true;

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

        final minVersion =
            (data['minVersion'] as String?) ?? AppConfig.appVersion;
        var latestVersion =
            (data['latestVersion'] as String?) ?? AppConfig.appVersion;
        if (_isVersionOlder(latestVersion, minVersion)) {
          latestVersion = minVersion;
        }
        final currentVersion = AppConfig.appVersion;

        final hasUpdate = _isVersionOlder(currentVersion, latestVersion);
        final isForceUpdate = _isVersionOlder(currentVersion, minVersion);

        return AppVersionCheckResult(
          latestVersion: latestVersion,
          minVersion: minVersion,
          hasUpdate: hasUpdate,
          isForceUpdate: isForceUpdate,
        );
      } else {
        throw const AppException(
          message: 'Security verification unavailable',
          type: AppExceptionType.server,
        );
      }
    } on DioException catch (e) {
      final appCheckError = e.requestOptions.extra['appCheckError'] as String?;

      if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
        final data = e.response?.data as Map<String, dynamic>?;
        final isSecurityType = data != null && data['type'] == 'security';
        final backendReason =
            (data?['reason'] as String?) ??
            (data?['error'] as String?) ??
            (data?['appCheckError'] as String?);

        if (isSecurityType ||
            (e.response?.statusCode == 403 && appCheckError != null)) {
          final action =
              data?['action'] ??
              'Please ensure your device is not rooted, you are using the official app, and you have a stable internet connection.';

          throw AppException(
            message: appCheckError != null
                ? 'Device verification failed: $appCheckError'
                : (backendReason ?? 'Security verification failed'),
            type: AppExceptionType.unauthorized,
            details: {
              ...?data,
              'type': 'security',
              'reason':
                  appCheckError ?? backendReason ?? 'App attestation failed',
              'appCheckError': appCheckError,
              'action': action,
            },
          );
        }
      }
      rethrow;
    }
  }

  Future<Response<dynamic>> fetchAttestationDetails([
    String? supabaseToken,
  ]) async {
    return _dio.get<dynamic>(
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
}

final securityServiceProvider = Provider<SecurityService>(SecurityService.new);
