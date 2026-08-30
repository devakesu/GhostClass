import 'dart:async';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
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
import 'package:ghostclass/main.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/push_notification_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/security_guard.dart';
import 'package:ghostclass/services/security_service.dart';
import 'package:ghostclass/services/startup_flow_service.dart';
import 'package:ghostclass/widgets/app_update_dialog.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';
import 'package:go_router/go_router.dart';

class _StartupSnapshot {
  const _StartupSnapshot({
    required this.user,
    required this.versionResult,
  });

  final AuthenticatedUser? user;
  final AppVersionCheckResult? versionResult;
}

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  static const Duration _startupCacheTtl = Duration(seconds: 20);

  bool _pushInitTriggered = false;
  Future<void>? _initializeInFlight;

  String _currentSessionKey() {
    final session = ref.read(supabaseClientProvider).auth.currentSession;
    return session?.user.id ?? 'anon';
  }

  bool _canUseStartupCache(String sessionKey, StartupFlowService startupFlow) {
    final cachedAt = startupFlow.startupCacheAt;
    final cache = startupFlow.startupCache;
    if (cache == null || cache is! _StartupSnapshot || cachedAt == null) {
      return false;
    }
    if (startupFlow.startupCacheSessionKey != sessionKey) return false;
    return DateTime.now().difference(cachedAt) <= _startupCacheTtl;
  }

  Future<_StartupSnapshot> _runStartupChecksSingleFlight() {
    final sessionKey = _currentSessionKey();
    final startupFlow = ref.read(startupFlowServiceProvider);

    final cache = startupFlow.startupCache;
    if (cache is _StartupSnapshot &&
        _canUseStartupCache(sessionKey, startupFlow)) {
      return Future<_StartupSnapshot>.value(cache);
    }

    final inFlight = startupFlow.startupInFlight;
    if (inFlight != null && startupFlow.startupCacheSessionKey == sessionKey) {
      return inFlight.then((val) {
        if (val is _StartupSnapshot) return val;
        throw StateError(
          'Invalid in-flight startup snapshot type: ${val.runtimeType}',
        );
      });
    }

    final api = ref.read(apiServiceProvider);
    AppLogger.i('SplashScreen: Starting parallel initialization tasks...');
    final skipIntegrityForPostLogin = ref
        .read(startupFlowServiceProvider)
        .consumePostLoginFastPath(sessionKey);
    if (skipIntegrityForPostLogin) {
      AppLogger.i(
        'SplashScreen: Post-login fast-path active. Skipping integrity check for this pass.',
      );
    }

    final future = () async {
      AppVersionCheckResult? versionResult;
      Object? integrityError;
      StackTrace? integrityStack;

      Future<void> integrityTask;
      if (skipIntegrityForPostLogin) {
        integrityTask = Future<void>.value();
      } else {
        integrityTask = api
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
      }

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

      api.clearCaches();
      AppLogger.i('SplashScreen: Awaiting Future.wait...');
      await Future.wait<dynamic>([
        integrityTask,
        authTask,
      ]);
      AppLogger.i('SplashScreen: Future.wait completed');

      if (integrityError != null) {
        Error.throwWithStackTrace(
          integrityError!,
          integrityStack ?? StackTrace.current,
        );
      }
      if (authError != null) {
        Error.throwWithStackTrace(authError!, authStack ?? StackTrace.current);
      }

      return _StartupSnapshot(user: user, versionResult: versionResult);
    }();

    startupFlow
      ..startupCacheSessionKey = sessionKey
      ..startupInFlight = future;

    return future
        .then((snapshot) {
          startupFlow
            ..startupCache = snapshot
            ..startupCacheAt = DateTime.now();
          return snapshot;
        })
        .whenComplete(() {
          if (identical(startupFlow.startupInFlight, future)) {
            startupFlow.startupInFlight = null;
          }
        });
  }

  void _beginInitializeIfIdle() {
    if (_initializeInFlight != null) return;
    final future = _initializeApp();
    _initializeInFlight = future.whenComplete(() {
      if (identical(_initializeInFlight, future)) {
        _initializeInFlight = null;
      }
    });
  }

  void _startPushInitInBackgroundAfterSplash(
    PushNotificationService pushService,
  ) {
    if (_pushInitTriggered) return;
    _pushInitTriggered = true;

    AppLogger.safeUnawait(
      Future<void>.delayed(const Duration(seconds: 2), () async {
        await pushService.initialize();
      }).catchError((Object e, StackTrace st) {
        AppLogger.e('SplashScreen: Deferred push init failed', e, st);
      }),
      'SplashScreen: deferred push init',
    );
  }

  void _prewarmAppData({
    required Future<dynamic> dashboardFuture,
    required Future<dynamic> trackingFuture,
    required Future<dynamic> leaveFuture,
    required Future<dynamic> scoreFuture,
    required Future<dynamic> notificationsFuture,
  }) {
    void prewarm(Future<dynamic> future, String label) {
      AppLogger.safeUnawait(
        future.catchError((Object e, StackTrace st) {
          AppLogger.e('SplashScreen: $label prewarm failed', e, st);
        }),
        'SplashScreen: $label prewarm',
      );
    }

    prewarm(dashboardFuture, 'dashboard');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      prewarm(trackingFuture, 'tracking');
      prewarm(leaveFuture, 'leave');
      Future.delayed(const Duration(milliseconds: 150), () {
        prewarm(scoreFuture, 'scores');
        prewarm(notificationsFuture, 'notifications');
      });
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _beginInitializeIfIdle();
    });
  }

  void _startPostNavigationPreloads({
    required ApiService apiService,
  }) {
    AppLogger.safeUnawait(
      apiService.preWarm().catchError((Object e, StackTrace st) {
        AppLogger.e('SplashScreen: post-nav API pre-warm failed', e, st);
      }),
      'SplashScreen: post-nav API pre-warm',
    );
  }

  Future<void> _initializeApp() async {
    // Keep the splash visible for 1.5s to improve perceived startup time
    final splashHold = Future<void>.delayed(
      const Duration(milliseconds: 1500),
      () {
        AppLogger.i('SplashScreen: 1.5s delay completed');
      },
    );

    // 2. Critical Security Check First
    try {
      if (FirebaseInitializer.initFuture != null) {
        AppLogger.i(
          'SplashScreen: Awaiting Firebase & App Check initialization...',
        );
        try {
          await FirebaseInitializer.initFuture!;
          AppLogger.i(
            'SplashScreen: Firebase & App Check initialization completed.',
          );
        } on Object catch (initErr) {
          AppLogger.e(
            'SplashScreen: Firebase & App Check initialization failed',
            initErr,
          );
          throw AppException(
            message: 'Security subsystem initialization failed.',
            type: AppExceptionType.unauthorized,
            details: {
              'type': 'security',
              'reason': 'Device security verification setup failed.',
              'action':
                  'Please ensure Google Play Services are enabled and update the app.',
              'criticalRisk': true,
              'appCheckError': initErr.toString(),
            },
          );
        }
      }
      final snapshot = await _runStartupChecksSingleFlight();
      if (!mounted) return;
      final finalVersionResult = snapshot.versionResult;
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
      if (!mounted) return;

      final finalUser = snapshot.user;
      AppLogger.i(
        'SplashScreen: Initialized user: ${finalUser?.supabaseUserId ?? "null"} (syncing: ${finalUser?.isSyncing ?? "false"})',
      );
      if (mounted &&
          finalUser != null &&
          finalUser.profile?.avatarUrl != null) {
        try {
          final _ = precacheImage(
            CachedNetworkImageProvider(
              finalUser.profile!.avatarUrl!,
              maxWidth: 240,
              maxHeight: 240,
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
            SecurityService.isTransientAppCheckFailureText(appCheckError) ||
            SecurityService.isTransientAppCheckFailureText(reason);

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
          retryLabel: isCritical
              ? 'Close App'
              : (Platform.isAndroid ? 'Restart App' : 'Retry'),
          onRetry: isCritical
              ? () => ref.read(securityGuardProvider).wipeAndExit()
              : (Platform.isAndroid
                    ? SystemNavigator.pop
                    : _beginInitializeIfIdle),
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
          // Trigger a fresh build of the Ref which will re-run initialization.
          ref.invalidate(authProvider);
          _beginInitializeIfIdle();
        },
      );
      return;
    }

    // 3. Check final state
    // We already awaited authTask inside the Future.wait, so this is instant now.
    if (!mounted) return;
    final finalUser = ref.read(authProvider).value;

    // Capture services and futures synchronously while mounted is guaranteed true
    final pushService = ref.read(pushNotificationServiceProvider);
    final apiService = ref.read(apiServiceProvider);
    final supabaseClient = ref.read(supabaseClientProvider);
    final token = supabaseClient.auth.currentSession?.accessToken;

    if (finalUser != null) {
      if (finalUser.termsAccepted) {
        final dashboardFuture = ref.read(dashboardProvider.future);
        final trackingFuture = ref.read(trackingProvider.future);
        final leaveFuture = ref.read(leaveProvider.future);
        final scoreFuture = ref.read(scoreProvider.future);
        final notificationsFuture = ref.read(notificationsProvider.future);

        _startPushInitInBackgroundAfterSplash(pushService);
        context.go('/dashboard');
        AppLogger.safeUnawait(
          Future<void>.microtask(() async {
            _triggerCronSyncAndPrewarm(
              user: finalUser,
              apiService: apiService,
              token: token,
              dashboardFuture: dashboardFuture,
              trackingFuture: trackingFuture,
              leaveFuture: leaveFuture,
              scoreFuture: scoreFuture,
              notificationsFuture: notificationsFuture,
            );
            _startPostNavigationPreloads(
              apiService: apiService,
            );
          }).catchError((Object e, StackTrace st) {
            AppLogger.e('SplashScreen: post-dashboard preloads failed', e, st);
          }),
          'SplashScreen: post-dashboard preloads',
        );
      } else {
        _startPushInitInBackgroundAfterSplash(pushService);
        context.go('/accept-terms');
        AppLogger.safeUnawait(
          Future<void>.microtask(() async {
            _startPostNavigationPreloads(
              apiService: apiService,
            );
          }).catchError((Object e, StackTrace st) {
            AppLogger.e(
              'SplashScreen: post-accept-terms preloads failed',
              e,
              st,
            );
          }),
          'SplashScreen: post-accept-terms preloads',
        );
      }
    } else {
      context.go('/login');
      AppLogger.safeUnawait(
        Future<void>.microtask(() async {
          _startPostNavigationPreloads(
            apiService: apiService,
          );
        }).catchError((Object e, StackTrace st) {
          AppLogger.e('SplashScreen: post-login preloads failed', e, st);
        }),
        'SplashScreen: post-login preloads',
      );
    }
  }

  void _triggerCronSyncAndPrewarm({
    required AuthenticatedUser user,
    required ApiService apiService,
    required String? token,
    required Future<dynamic> dashboardFuture,
    required Future<dynamic> trackingFuture,
    required Future<dynamic> leaveFuture,
    required Future<dynamic> scoreFuture,
    required Future<dynamic> notificationsFuture,
  }) {
    // 1. Trigger Cron Sync in parallel (fire-and-forget)
    if (token != null) {
      AppLogger.safeUnawait(
        apiService.scheduleSync(token).catchError((Object e, StackTrace st) {
          AppLogger.e('SplashScreen: Cron Sync failed', e, st);
        }),
        'SplashScreen: Cron Sync',
      );
    }

    // 2. Prewarm all other screen queries
    _prewarmAppData(
      dashboardFuture: dashboardFuture,
      trackingFuture: trackingFuture,
      leaveFuture: leaveFuture,
      scoreFuture: scoreFuture,
      notificationsFuture: notificationsFuture,
    );
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
            .animate(
              onPlay: (controller) => controller.repeat(
                reverse: true,
                period: 1200.ms,
              ),
            )
            .scale(
              begin: const Offset(1, 1),
              end: const Offset(1.05, 1.05),
              duration: 1200.ms,
              curve: Curves.easeInOut,
            )
            .shimmer(
              duration: 1200.ms,
              color: Colors.white.withValues(alpha: 0.3),
            ),
      ),
    );
  }
}
