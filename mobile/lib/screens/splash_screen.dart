import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:ghostclass/widgets/app_update_dialog.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';
import 'package:go_router/go_router.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  void _prewarmAppData() {
    void prewarm(Future<dynamic> future, String label) {
      AppLogger.safeUnawait(
        future.catchError((Object e, StackTrace st) {
          AppLogger.e('SplashScreen: $label prewarm failed', e, st);
        }),
        'SplashScreen: $label prewarm',
      );
    }

    prewarm(ref.read(dashboardProvider.future), 'dashboard');
    prewarm(ref.read(trackingProvider.future), 'tracking');
    prewarm(ref.read(leaveProvider.future), 'leave');
    prewarm(ref.read(scoreProvider.future), 'scores');
    prewarm(ref.read(notificationsProvider.future), 'notifications');
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final _ = _initializeApp();
    });
  }

  Future<void> _initializeApp() async {
    // 1. Proactively pre-warm security layers while logo is showing
    // Keep the splash visible for 2s to improve perceived startup time
    final splashHold = Future<void>.delayed(
      const Duration(milliseconds: 2000),
      () {
        AppLogger.i('SplashScreen: 2s delay completed');
      },
    );

    // Kick off non-critical pre-warms in the background so they do not block
    AppLogger.safeUnawait(
      JweService.instance.preWarm().catchError(
        (Object e, StackTrace st) =>
            AppLogger.e('SplashScreen: JWE pre-warm failed', e, st),
      ),
      'SplashScreen: JWE pre-warm',
    );

    AppLogger.safeUnawait(
      ref
          .read(apiServiceProvider)
          .preWarm()
          .catchError(
            (Object e, StackTrace st) =>
                AppLogger.e('SplashScreen: API pre-warm failed', e, st),
          ),
      'SplashScreen: API pre-warm',
    );

    // 2. Critical Security Check First
    try {
      final api = ref.read(apiServiceProvider);

      AppLogger.i('SplashScreen: Starting parallel initialization tasks...');

      AppVersionCheckResult? versionResult;
      Object? integrityError;
      StackTrace? integrityStack;

      final integrityTask = api
          .verifyIntegrity()
          .then((res) {
            AppLogger.i('SplashScreen: integrityTask completed');
            versionResult = res;
          })
          .catchError((Object e, StackTrace st) {
            AppLogger.e('SplashScreen: integrityTask failed', e, st);
            integrityError = e;
            integrityStack = st;
          });

      AuthenticatedUser? user;
      Object? authError;
      StackTrace? authStack;

      final authTask = ref
          .read(authProvider.future)
          .then((res) {
            AppLogger.i('SplashScreen: authTask completed');
            user = res;
          })
          .catchError((Object e, StackTrace st) {
            AppLogger.e('SplashScreen: authTask failed', e, st);
            authError = e;
            authStack = st;
          });

      // CLEAR ALL previous app-open caches for a truly fresh start
      api.clearCaches();

      AppLogger.i('SplashScreen: Awaiting Future.wait...');
      // Wait for both critical security attestation & profile sync to resolve (success or failure)
      await Future.wait<dynamic>([
        integrityTask,
        authTask,
      ]);

      AppLogger.i('SplashScreen: Future.wait completed');

      // Prioritize attestation/security error over auth/profile sync error
      if (integrityError != null) {
        Error.throwWithStackTrace(
          integrityError!,
          integrityStack ?? StackTrace.current,
        );
      }

      if (authError != null) {
        Error.throwWithStackTrace(authError!, authStack ?? StackTrace.current);
      }

      final finalVersionResult = versionResult;
      if (finalVersionResult != null && finalVersionResult.hasUpdate) {
        ref.read(appUpdateProvider.notifier).setCheckResult(finalVersionResult);

        if (finalVersionResult.isForceUpdate) {
          AppLogger.e('SplashScreen: Force update required!');
          if (!mounted) return;
          await AppUpdateDialog.show(
            context,
            finalVersionResult.latestVersion,
            isForceUpdate: true,
          );
          // Block splash screen - stay here forever
          return;
        }
      }

      await splashHold;

      final finalUser = user;
      AppLogger.i(
        'SplashScreen: Initialized user: ${finalUser?.supabaseUserId ?? "null"} (syncing: ${finalUser?.isSyncing ?? "false"})',
      );
      if (mounted &&
          finalUser != null &&
          finalUser.profile?.avatarUrl != null) {
        try {
          final _ = precacheImage(
            NetworkImage(
              finalUser.profile!.avatarUrl!,
              headers: {
                'Origin': AppConfig.supabaseOrigin,
              },
            ),
            context,
          );
        } on Object catch (e, st) {
          AppLogger.e('SplashScreen: Avatar pre-cache failed', e, st);
        }
      }
    } on Object catch (e) {
      AppLogger.e('SplashScreen: Initialization error', e);

      if (!mounted) return;

      final api = ref.read(apiServiceProvider);

      // Handle Security Failures specifically
      if (e is AppException && e.details?['type'] == 'security') {
        final reason = (e.details?['reason'] as String?) ?? e.message;
        final action =
            (e.details?['action'] as String?) ?? 'Please restart the app.';
        final criticalRisk = e.details?['criticalRisk'] == true;
        final appCheckError = e.details?['appCheckError'] as String?;

        AppLogger.e(
          'SplashScreen: Security failure detected. Critical: $criticalRisk, AppCheckError: $appCheckError',
          e,
        );

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
          api.clearCaches();
          try {
            await ref.read(secureStorageProvider).clearAttestationResult();
          } on Object catch (e) {
            AppLogger.e('SplashScreen: Failed to clear attestation cache', e);
          }
          await ref.read(authProvider.notifier).logout(force: true);
        }

        if (!mounted) return;

        final isCritical = criticalRisk || isGenuineSecurityFailure;

        // Use backend-provided strings directly for the main message
        final dialogMessage = '$reason\n\n$action';

        final _ = SecurityUtils.showSecurityFailureDialog(
          context,
          title: isCritical
              ? 'Security Verification Failed'
              : 'Security Handshake Failed',
          message: dialogMessage,
          technicalDetails: sanitizeTechnicalDetails(
            '$e\n\n'
            '${appCheckError != null ? "Local Error: $appCheckError" : ""}',
          ),
          retryLabel: Platform.isAndroid
              ? (isCritical ? 'Close App' : 'Restart App')
              : (isCritical ? null : 'Retry'),
          onRetry: Platform.isAndroid
              ? SystemNavigator.pop
              : (isCritical ? null : _initializeApp),
        );
        return;
      }

      var messages = <String>[];
      if (e is DioException) {
        final appEx = api.mapDioError(e);
        messages = [appEx.message];
      } else {
        messages = ['We encountered a problem during startup.', e.toString()];
      }

      final technicalDetails = sanitizeTechnicalDetails(e.toString());

      await ServiceErrorDialog.show(
        context,
        'Connectivity Issue',
        messages,
        details: technicalDetails,
        isDismissible: false,
        onContactSupport: () => SupportHelper.contactViaEmail(
          subject: 'App Connectivity Issue [v${AppConfig.appVersion}]',
          customBody:
              'Hello GhostClass Support Team,\n\n'
              'I encountered a connectivity issue during app startup.\n\n'
              '-- SUMMARY --\n'
              'Error: ${messages.first}\n'
              'Technical Details: $technicalDetails\n',
        ),
        onRetry: () {
          // Trigger a fresh build of the Ref which will re-run _initializeApp
          ref.invalidate(authProvider);
          final _ = _initializeApp();
        },
      );
      return;
    }

    // 3. Check final state
    // We already awaited authTask inside the Future.wait, so this is instant now.
    if (!mounted) return;
    final finalUser = ref.read(authProvider).value;

    if (finalUser != null) {
      if (finalUser.termsAccepted) {
        _triggerCronSyncAndPrewarm(finalUser);
        context.go('/dashboard');
      } else {
        context.go('/accept-terms');
      }
    } else {
      context.go('/login');
    }
  }

  void _triggerCronSyncAndPrewarm(AuthenticatedUser user) {
    // 1. Trigger Cron Sync in parallel (fire-and-forget)
    AppLogger.safeUnawait(
      () async {
        final token = ref
            .read(supabaseClientProvider)
            .auth
            .currentSession
            ?.accessToken;
        if (token != null) {
          await ref.read(apiServiceProvider).scheduleSync(token);
        }
      }(),
      'SplashScreen: Cron Sync',
    );

    // 2. Prewarm all other screen queries
    _prewarmAppData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Center(
        child: Image.asset('assets/images/logo.png', height: 120)
            .animate()
            .fade(duration: 400.ms)
            .scale(
              begin: const Offset(0.8, 0.8),
              end: const Offset(1, 1),
              duration: 400.ms,
              curve: Curves.easeOutCubic,
            )
            .then() // Chain effects after the entrance
            .animate(onPlay: (controller) => controller.repeat(reverse: true))
            .scale(
              begin: const Offset(1, 1),
              end: const Offset(1.05, 1.05),
              duration: 500.ms,
              curve: Curves.easeInOut,
            )
            .animate(onPlay: (controller) => controller.repeat())
            .shimmer(
              duration: 600.ms,
              color: Colors.white.withValues(alpha: 0.3),
            ),
      ),
    );
  }
}
