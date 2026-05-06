import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/constants/content_cache.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';
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
    _initializeApp();
  }

  Future<void> _initializeApp() async {
    // 1. Start background tasks immediately (Concurrent with animation)
    final authTask = ref.read(authProvider.future);

    // Proactively pre-warm security layers while logo is showing
    final jwePreWarm = JweService.instance.preWarm();
    final apiPreWarm = ref.read(apiServiceProvider).preWarm();

    ContentCache.warmUp();

    // 2. Minimum animation duration and opportunistic cache warming
    try {
      final api = ref.read(apiServiceProvider);

      // Perform full server-side integrity check on app opening
      final integrityCheck = api.verifyIntegrity();

      await Future.wait([
        Future.delayed(const Duration(milliseconds: 1800)),
        jwePreWarm,
        apiPreWarm,
        integrityCheck,
        authTask.then((user) {
          if (!mounted || user == null || user.profile?.avatarUrl == null) {
            return;
          }
          try {
            precacheImage(NetworkImage(user.profile!.avatarUrl!), context);
          } catch (e, st) {
            AppLogger.e('SplashScreen: Avatar pre-cache failed', e, st);
          }
        }),
      ]);
    } catch (e) {
      AppLogger.e('SplashScreen: Initialization error', e);

      if (!mounted) return;

      final api = ref.read(apiServiceProvider);

      // Handle Security Failures specifically
      if (e is AppException && e.details?['type'] == 'security') {
        final reason = e.details?['reason'] ?? e.message;
        final action = e.details?['action'] ?? 'Please restart the app.';
        final criticalRisk = e.details?['criticalRisk'] == true;

        if (criticalRisk) {
          ref.read(apiServiceProvider).clearCaches();
          await ref.read(authProvider.notifier).logout(force: true);
        }

        SecurityUtils.showSecurityFailureDialog(
          context,
          title: 'Security Verification Failed',
          message: '$reason\n\n $action',
          technicalDetails: e.toString(),
          retryLabel: 'Exit App',
          onRetry: () => exit(0),
          isDismissible: false,
        );
        return;
      }

      List<String> messages = ['We encountered a problem during startup.'];

      if (e is DioException) {
        final appEx = api.mapDioError(e);
        messages = [appEx.message];
      } else {
        messages.add(e.toString());
      }

      await ServiceErrorDialog.show(
        context,
        'Connectivity Issue',
        messages,
        isDismissible: false,
        onRetry: () {
          // Trigger a fresh build of the Ref which will re-run _initializeApp
          ref.invalidate(authProvider);
          _initializeApp();
        },
      );
      return;
    }

    // 3. Check final state
    // We already awaited authTask inside the Future.wait, so this is instant now.
    // However, the value of 'user' may have changed due to the unawaited refreshProfile
    // call inside AUTH provider (though in the latest fix I made it awaited).
    // Let's use ref.read(authProvider).value to get the absolute current state.
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
        child: Image.asset('assets/logo.png', height: 120)
            .animate()
            .fade(duration: 400.ms)
            .scale(
              begin: const Offset(0.7, 0.7),
              end: const Offset(1.0, 1.0),
              duration: 400.ms,
              curve: Curves.easeOutBack,
            )
            .then() // Chain effects after the entrance
            .animate(onPlay: (controller) => controller.repeat(reverse: true))
            .scale(
              begin: const Offset(1.0, 1.0),
              end: const Offset(1.05, 1.05),
              duration: 400.ms,
              curve: Curves.easeInOut,
            )
            .animate(onPlay: (controller) => controller.repeat())
            .shimmer(
              duration: 600.ms,
              color: Colors.white.withValues(alpha: 0.4),
            ),
      ),
    );
  }
}
