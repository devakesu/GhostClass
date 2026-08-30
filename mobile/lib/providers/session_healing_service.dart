import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

final sessionHealingServiceProvider =
    NotifierProvider<SessionHealingService, void>(
      SessionHealingService.new,
    );

class SessionHealingService extends Notifier<void> {
  int _consecutiveHealFailures = 0;
  bool _isRefreshing = false;

  bool get isRefreshing => _isRefreshing;

  @override
  void build() {
    // No-op state
  }

  void reset() {
    _consecutiveHealFailures = 0;
    _isRefreshing = false;
  }

  Future<void> handleUnauthorized() async {
    final authNotifier = ref.read(authProvider.notifier);
    if (_isRefreshing || authNotifier.isInitializing) return;
    _isRefreshing = true;
    final healAttemptId = DateTime.now().microsecondsSinceEpoch.toString();

    final api = ref.read(apiServiceProvider)..suppress401 = true;
    AppLogger.e('AuthNotifier: 401 DETECTED. Attempting self-healing...');
    AppLogger.d(
      'AuthNotifier [HEAL-$healAttemptId]: Starting heal with $_consecutiveHealFailures prior failures',
    );

    try {
      final backoffMs = _consecutiveHealFailures > 0
          ? (500 * (1 << (_consecutiveHealFailures - 1))).clamp(500, 5000)
          : 0;
      if (backoffMs > 0) {
        AppLogger.d(
          'AuthNotifier [HEAL-$healAttemptId]: Waiting ${backoffMs}ms before retry (attempt ${_consecutiveHealFailures + 1})',
        );
        await Future<void>.delayed(Duration(milliseconds: backoffMs));
      }

      final oldToken = ref.read(authProvider).value?.ezygoToken;
      if (ref.read(authProvider).value == null) {
        final recoveredUser = await ref
            .read(profileHydrationServiceProvider.notifier)
            .buildFromCurrentSession();
        if (recoveredUser != null) {
          authNotifier.updateState(recoveredUser);
          AppLogger.d(
            'AuthNotifier [HEAL-$healAttemptId]: Recovered user from session',
          );
        }
      }

      final supabaseToken = await authNotifier.getFreshSupabaseToken();
      if (supabaseToken == null) {
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: Supabase token unavailable, logging out',
        );
        await authNotifier.logout();
        return;
      }

      Response<dynamic>? syncRes;
      try {
        AppLogger.d(
          'AuthNotifier [HEAL-$healAttemptId]: Calling syncMobileAuth (attempt 1/2)',
        );
        syncRes = await api
            .syncMobileAuth(supabaseToken)
            .timeout(AppConfig.defaultTimeout);
      } on TimeoutException catch (e, st) {
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: syncMobileAuth timed out (attempt 1)',
          e,
          st,
        );
        syncRes = null;
      }

      if (syncRes == null || syncRes.statusCode != 200) {
        try {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          AppLogger.d(
            'AuthNotifier [HEAL-$healAttemptId]: Calling syncMobileAuth (attempt 2/2)',
          );
          syncRes = await api
              .syncMobileAuth(supabaseToken)
              .timeout(AppConfig.defaultTimeout);
        } on Object catch (e, st) {
          AppLogger.e(
            'AuthNotifier [HEAL-$healAttemptId]: syncMobileAuth retry failed',
            e,
            st,
          );
          syncRes = null;
        }
      }

      if (syncRes != null &&
          syncRes.statusCode == 200 &&
          syncRes.data is Map<String, dynamic>) {
        final syncData = syncRes.data as Map<String, dynamic>;
        final syncedToken = (syncData['ezygo_token'] as String?)?.trim();

        if (syncedToken != null && syncedToken.isNotEmpty) {
          try {
            await ref.read(secureStorageProvider).saveEzygoToken(syncedToken);
            AppLogger.d(
              'AuthNotifier [HEAL-$healAttemptId]: Persisted synced ezygo token',
            );
          } on Object catch (e, st) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Failed to persist synced ezygo token',
              e,
              st,
            );
          }

          final current = ref.read(authProvider).value;
          if (current != null) {
            final syncedTermsVersion = syncData['terms_version'] as String?;
            final syncedEzygoId = syncData['id']?.toString();
            authNotifier.updateState(
              current.copyWith(
                ezygoToken: EncryptedValue.fromPlaintext(syncedToken),
                termsVersion: syncedTermsVersion,
                ezygoId: syncedEzygoId,
              ),
            );
            AppLogger.d(
              'AuthNotifier [HEAL-$healAttemptId]: Updated state with synced token',
            );
          }
        }
      }

      AppLogger.d('AuthNotifier [HEAL-$healAttemptId]: Refreshing profile');
      await ref
          .read(profileHydrationServiceProvider.notifier)
          .refreshProfile(force: true);
      final newToken = ref.read(authProvider).value?.ezygoToken;

      if (newToken != null && newToken != oldToken) {
        AppLogger.i(
          'AuthNotifier [HEAL-$healAttemptId]: SELF-HEALING SUCCESSFUL. Token changed',
        );
        _consecutiveHealFailures = 0;
      } else {
        _consecutiveHealFailures++;
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: Self-healing did not produce a new token. Consecutive failures: $_consecutiveHealFailures',
        );

        if (_consecutiveHealFailures >= 3) {
          final lastError = ref.read(authProvider).error;
          final isSecurityError =
              lastError is AppException &&
              lastError.details?['type'] == 'security';

          if (isSecurityError) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Terminal security block detected. Not logging out.',
            );
            _consecutiveHealFailures = 0;
          } else {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Terminal 401 loop detected after $_consecutiveHealFailures attempts. Logging out to protect state.',
            );
            await authNotifier.logout();
          }
        }
      }
    } on Object catch (e) {
      AppLogger.e('AuthNotifier [HEAL-$healAttemptId]: Self-healing error', e);
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.e(
            'AuthNotifier [HEAL-$healAttemptId]: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: CRITICAL SECURITY RISK. Logging out.',
            );
          }
          await authNotifier.logout();
        }
      }
    } finally {
      final cooldownMs = _consecutiveHealFailures > 0
          ? (500 * (1 << (_consecutiveHealFailures - 1))).clamp(500, 5000)
          : 1000;
      AppLogger.d(
        'AuthNotifier [HEAL-$healAttemptId]: Cooldown for ${cooldownMs}ms before next 401 can trigger',
      );
      await Future<void>.delayed(Duration(milliseconds: cooldownMs));
      api.suppress401 = false;
      _isRefreshing = false;
    }
  }

  Future<void> handleSecurityLockdown(Map<String, String> data) async {
    AppLogger.e('AuthNotifier: SECURITY LOCKDOWN TRIGGERED');

    ref
        .read(securityFailureProvider.notifier)
        .setFailure(
          data['title'],
          criticalRisk: true,
          reason: data['reason'],
          action: data['action'],
          source: data['technicalDetails'],
        );

    await ref.read(authProvider.notifier).logout(force: true);
  }
}
