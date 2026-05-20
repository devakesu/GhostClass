import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';
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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final _ = _initializeApp();
    });
  }

  Future<void> _initializeApp() async {
    // 1. Proactively pre-warm security layers while logo is showing
    final jwePreWarm = JweService.instance.preWarm();
    final apiPreWarm = ref.read(apiServiceProvider).preWarm();

    // 2. Critical Security Check First
    try {
      final api = ref.read(apiServiceProvider);

      AppLogger.i('SplashScreen: Starting parallel initialization tasks...');

      // Start device attestation and auth profile sync in parallel!
      final integrityTask = api.verifyIntegrity().then((res) {
        AppLogger.i('SplashScreen: integrityTask completed');
        return res;
      });
      final authTask = ref.read(authProvider.future).then((res) {
        AppLogger.i('SplashScreen: authTask completed');
        return res;
      });

      // CLEAR ALL previous app-open caches for a truly fresh start
      api.clearCaches();

      AppLogger.i('SplashScreen: Awaiting Future.wait...');
      // Wait for both critical security attestation & profile sync to resolve successfully
      final results = await Future.wait<dynamic>([
        integrityTask,
        authTask,
        jwePreWarm.then((_) {
          AppLogger.i('SplashScreen: jwePreWarm completed');
        }),
        apiPreWarm.then((_) {
          AppLogger.i('SplashScreen: apiPreWarm completed');
        }),
        Future<void>.delayed(const Duration(milliseconds: 3000)).then((_) {
          AppLogger.i('SplashScreen: 3s delay completed');
        }),
      ]);

      AppLogger.i('SplashScreen: Future.wait completed successfully');

      final versionResult = results[0] as AppVersionCheckResult?;

      if (versionResult != null && versionResult.hasUpdate) {
        ref.read(appUpdateProvider.notifier).setCheckResult(versionResult);

        if (versionResult.isForceUpdate) {
          AppLogger.e('SplashScreen: Force update required!');
          if (!mounted) return;
          await AppUpdateDialog.show(
            context,
            versionResult.latestVersion,
            isForceUpdate: true,
          );
          // Block splash screen - stay here forever
          return;
        }
      }

      final user = results[1] as AuthenticatedUser?;
      AppLogger.i(
        'SplashScreen: Initialized user: ${user?.supabaseUserId ?? "null"} (syncing: ${user?.isSyncing ?? "false"})',
      );
      if (mounted && user != null && user.profile?.avatarUrl != null) {
        try {
          final _ = precacheImage(
            NetworkImage(
              user.profile!.avatarUrl!,
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
        final reason = e.details?['reason'] ?? e.message;
        final action = e.details?['action'] ?? 'Please restart the app.';
        final criticalRisk = e.details?['criticalRisk'] == true;
        final appCheckError = e.details?['appCheckError'] as String?;

        AppLogger.e(
          'SplashScreen: Security failure detected. Critical: $criticalRisk, AppCheckError: $appCheckError',
          e,
        );

        if (criticalRisk) {
          api.clearCaches();
          await ref.read(authProvider.notifier).logout(force: true);
        }

        if (!mounted) return;

        // Use backend-provided strings directly for the main message
        final dialogMessage = '$reason\n\n$action';

        final _ = SecurityUtils.showSecurityFailureDialog(
          context,
          title: criticalRisk
              ? 'Security Verification Failed'
              : 'Security Handshake Failed',
          message: dialogMessage,
          technicalDetails: sanitizeTechnicalDetails(
            '$e\n\n'
            '${appCheckError != null ? "Local Error: $appCheckError" : ""}',
          ),
          retryLabel: criticalRisk ? 'Close App' : 'Restart App',
          onRetry: () => exit(0),
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
        context.go('/dashboard');
      } else {
        context.go('/accept-terms');
      }
    } else {
      context.go('/login');
    }
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
