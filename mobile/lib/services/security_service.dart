import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
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
  SecurityService(this._ref) {
    _ref.onDispose(() {
      _disposed = true;
    });
  }
  final Ref _ref;
  bool _disposed = false;
  static final String _ghostclassBaseUrl = AppConfig.ghostclassApiUrl;
  static const Duration _cachedAttestationMaxAge = Duration(hours: 6);
  static const Duration _blockingAttestationMaxAge = Duration(days: 7);

  Dio get _dio {
    if (_disposed) {
      throw StateError(
        'Cannot use SecurityService after it has been disposed.',
      );
    }
    return _ref.read(dioServiceProvider).dio;
  }

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

  bool _isTransientAppCheckFailureText(String text) {
    final msg = text.toLowerCase();
    return msg.contains('quota') ||
        msg.contains('connection') ||
        msg.contains('timeout') ||
        msg.contains('too_many_attempts') ||
        msg.contains('network') ||
        msg.contains('rate limit') ||
        msg.contains('server') ||
        msg.contains('internal error') ||
        msg.contains('-12') ||
        msg.contains('unavailable');
  }

  bool _isTransientErrorForFallback(Object e) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.badCertificate) {
        return true;
      }
      final statusCode = e.response?.statusCode;
      if (statusCode != null && statusCode >= 500) {
        return true;
      }
    }

    if (e is AppException) {
      if (e.type == AppExceptionType.network) {
        return true;
      }
      final reason = (e.details?['reason'] as String?) ?? e.message;
      final appCheckError = e.details?['appCheckError'] as String?;
      final isConnectionOrQuota =
          (appCheckError != null &&
              _isTransientAppCheckFailureText(appCheckError)) ||
          _isTransientAppCheckFailureText(reason);
      if (isConnectionOrQuota) {
        return true;
      }
    }

    final msg = e.toString().toLowerCase();
    if (msg.contains('socketexception') ||
        msg.contains('handshakeexception') ||
        msg.contains('network') ||
        msg.contains('connection') ||
        msg.contains('timeout')) {
      return true;
    }

    return false;
  }

  Future<AppVersionCheckResult?> verifyIntegrity() async {
    if (_disposed) return null;
    final storage = _ref.read(secureStorageProvider);
    final cachedRaw = await storage.getAttestationResult();
    if (_disposed) return null;
    Map<String, dynamic>? cachedMap;

    if (cachedRaw != null) {
      try {
        cachedMap = jsonDecode(cachedRaw) as Map<String, dynamic>;
        final latestVersion = cachedMap['latestVersion'] as String;
        final minVersion = cachedMap['minVersion'] as String;
        final cachedAt = DateTime.tryParse(
          cachedMap['cachedAt'] as String? ?? '',
        );
        final currentVersion = AppConfig.appVersion;

        final isUnderBlockingLimit =
            cachedAt != null &&
            DateTime.now().difference(cachedAt) <= _blockingAttestationMaxAge;

        if (isUnderBlockingLimit) {
          final hasUpdate = _isVersionOlder(currentVersion, latestVersion);
          final isForceUpdate = _isVersionOlder(currentVersion, minVersion);

          final cachedResult = AppVersionCheckResult(
            latestVersion: latestVersion,
            minVersion: minVersion,
            hasUpdate: hasUpdate,
            isForceUpdate: isForceUpdate,
          );

          final isFreshCache =
              DateTime.now().difference(cachedAt) <= _cachedAttestationMaxAge;

          if (!isFreshCache) {
            // Cache is stale but under blocking limit: return cached result instantly to avoid blocking,
            // but trigger background integrity check asynchronously to refresh the cache.
            AppLogger.safeUnawait(
              _runBackgroundIntegrityCheck().catchError(
                (Object e, StackTrace st) => AppLogger.e(
                  'SecurityService: Background integrity check failed',
                  e,
                  st,
                ),
              ),
              'SecurityService: background integrity check',
            );
          } else {
            AppLogger.d(
              'SecurityService: Returned fresh cached attestation check.',
            );
          }

          return cachedResult;
        }

        AppLogger.i(
          'SecurityService: Cached attestation is stale and exceeds blocking limit; refreshing.',
        );
      } on Object catch (e) {
        AppLogger.e('SecurityService: Failed to parse cached attestation', e);
      }
    }

    // Cache miss / stale cache: Blocking network attestation
    try {
      final result = await _performNetworkVerify();
      if (_disposed) return result;
      if (result != null) {
        await _cacheAttestationResult(result);
      }
      return result;
    } on Object catch (e) {
      if (cachedMap != null) {
        final isTransient = _isTransientErrorForFallback(e);
        if (isTransient) {
          AppLogger.w(
            'SecurityService: Network attestation failed transiently ($e). Falling back to stale cached attestation to permit offline access.',
          );
          final latestVersion = cachedMap['latestVersion'] as String;
          final minVersion = cachedMap['minVersion'] as String;
          final currentVersion = AppConfig.appVersion;
          final hasUpdate = _isVersionOlder(currentVersion, latestVersion);
          final isForceUpdate = _isVersionOlder(currentVersion, minVersion);

          return AppVersionCheckResult(
            latestVersion: latestVersion,
            minVersion: minVersion,
            hasUpdate: hasUpdate,
            isForceUpdate: isForceUpdate,
          );
        }
      }

      try {
        if (!_disposed) {
          await _ref.read(secureStorageProvider).clearAttestationResult();
        }
      } on Object catch (ex) {
        AppLogger.e('SecurityService: Failed to clear attestation cache', ex);
      }
      rethrow;
    }
  }

  Future<void> _cacheAttestationResult(AppVersionCheckResult result) async {
    try {
      if (_disposed) return;
      final storage = _ref.read(secureStorageProvider);
      final map = {
        'latestVersion': result.latestVersion,
        'minVersion': result.minVersion,
        'hasUpdate': result.hasUpdate,
        'isForceUpdate': result.isForceUpdate,
        'cachedAt': DateTime.now().toIso8601String(),
      };
      await storage.saveAttestationResult(jsonEncode(map));
      AppLogger.d('SecurityService: Cached attestation check result.');
    } on Object catch (e) {
      AppLogger.e('SecurityService: Failed to write attestation cache', e);
    }
  }

  Future<void> _runBackgroundIntegrityCheck() async {
    try {
      final result = await _performNetworkVerify();
      if (_disposed) return;
      if (result != null) {
        await _cacheAttestationResult(result);
        if (_disposed) return;

        // Update the reactive update state
        _ref.read(appUpdateProvider.notifier).setCheckResult(result);
      }
    } on AppException catch (e) {
      if (_disposed) return;
      if (e.details?['type'] == 'security') {
        AppLogger.e(
          'SecurityService: Background attestation failure detected.',
        );

        final reason = (e.details?['reason'] as String?) ?? e.message;
        final appCheckError = e.details?['appCheckError'] as String?;

        final isConnectionOrQuota =
            (appCheckError != null &&
                (appCheckError.toLowerCase().contains('quota') ||
                    appCheckError.toLowerCase().contains('connection') ||
                    appCheckError.toLowerCase().contains('timeout') ||
                    appCheckError.toLowerCase().contains('too_many_attempts') ||
                    appCheckError.toLowerCase().contains('network') ||
                    appCheckError.toLowerCase().contains('rate limit') ||
                    appCheckError.toLowerCase().contains('server') ||
                    appCheckError.toLowerCase().contains('internal error') ||
                    appCheckError.toLowerCase().contains('-12') ||
                    appCheckError.toLowerCase().contains('unavailable'))) ||
            (reason.toLowerCase().contains('quota') ||
                reason.toLowerCase().contains('connection') ||
                reason.toLowerCase().contains('timeout') ||
                reason.toLowerCase().contains('too_many_attempts') ||
                reason.toLowerCase().contains('network') ||
                reason.toLowerCase().contains('rate limit') ||
                reason.toLowerCase().contains('server') ||
                reason.toLowerCase().contains('internal error') ||
                reason.toLowerCase().contains('-12') ||
                reason.toLowerCase().contains('unavailable'));

        final isGenuineSecurityFailure = !isConnectionOrQuota;

        if (isGenuineSecurityFailure) {
          try {
            await _ref.read(secureStorageProvider).clearAttestationResult();
          } on Object catch (ex) {
            AppLogger.e(
              'SecurityService: Failed to clear attestation cache',
              ex,
            );
          }
          if (_disposed) return;

          // Force logout to wipe active session & user state
          try {
            await _ref.read(authProvider.notifier).logout(force: true);
          } on Object catch (ex) {
            AppLogger.e('SecurityService: Forced logout failed', ex);
          }
          if (_disposed) return;

          _ref
              .read(securityFailureProvider.notifier)
              .setFailure(
                e.message,
                criticalRisk: true,
                reason: e.details?['reason'] as String?,
                action: e.details?['action'] as String?,
                source: 'BackgroundAttestation',
              );
        } else {
          AppLogger.e(
            'SecurityService: Background attestation non-genuine failure (connection/quota/rate-limit). Ignored.',
            e,
          );
        }
      } else {
        AppLogger.e(
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
          final appCheckError =
              response.requestOptions.extra['appCheckError'] as String?;

          AppLogger.e(
            'SecurityService: Integrity verification failed. Reason: $reason',
            Exception(reason),
          );

          throw AppException(
            message: reason,
            type: AppExceptionType.unauthorized,
            details: {
              'type': 'security',
              'reason': reason,
              'action': action,
              'criticalRisk': criticalRisk,
              'appCheckError': appCheckError,
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

        AppLogger.d(
          'SecurityService: Integrity check passed. Current: $currentVersion, Latest: $latestVersion, Min: $minVersion',
        );

        return AppVersionCheckResult(
          latestVersion: latestVersion,
          minVersion: minVersion,
          hasUpdate: hasUpdate,
          isForceUpdate: isForceUpdate,
        );
      } else {
        AppLogger.e(
          'SecurityService: Attestation endpoint returned ${response.statusCode}',
        );
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

          final finalReason =
              appCheckError ?? backendReason ?? 'App attestation failed';

          AppLogger.e(
            'SecurityService: Security verification failed with ${e.response?.statusCode}. Reason: $finalReason',
            e,
          );

          throw AppException(
            message: appCheckError != null
                ? 'Device verification failed: $appCheckError'
                : (backendReason ?? 'Security verification failed'),
            type: AppExceptionType.unauthorized,
            details: {
              ...?data,
              'type': 'security',
              'reason': finalReason,
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
