import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/firebase_options.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:ghostclass/logic/security_initializer.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/push_notification_service.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/security_lockdown_listener.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// MyHttpOverrides
/// ---------------
/// Configures global HTTP behavior, including timeouts and custom certificate
/// validation logic for development environments.
class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context)
      ..connectionTimeout = kDebugMode
          ? const Duration(seconds: 40)
          : const Duration(seconds: 30);

    // In debug mode, we allow untrusted certificates ONLY if they match our expected hostname.
    // In release mode, standard certificate validation is enforced.
    if (kDebugMode) {
      client.badCertificateCallback = NetworkUtils.validateCertificateHostname;
    }

    return client;
  }
}

class _SecurityFailureApp extends StatelessWidget {
  const _SecurityFailureApp({
    required this.friendlyMessage,
    required this.technicalDetails,
  });
  final String friendlyMessage;
  final String technicalDetails;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(),
      home: Builder(
        builder: (context) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            final _ = SecurityUtils.showSecurityFailureDialog(
              context,
              title: 'Security Handshake Failed',
              message: friendlyMessage,
              technicalDetails: technicalDetails,
              retryLabel: Platform.isAndroid ? 'Close App' : null,
              onRetry: Platform.isAndroid ? () => exit(0) : null,
            );
          });
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        },
      ),
    );
  }
}

Future<void> _handleSecurityFailure(Object error) async {
  final errorMessage = error.toString();
  final friendlyMessage = errorMessage.contains('-3')
      ? 'GhostClass encountered a network security issue while verifying your device. This often happens on restricted WiFi or with custom DNS settings.'
      : "We couldn't verify the integrity of this app. To protect your data, GhostClass requires a secure, unmodified environment.";

  runApp(
    _SecurityFailureApp(
      friendlyMessage: friendlyMessage,
      technicalDetails: errorMessage,
    ),
  );
}

Future<void> _initializeFirebase() async {
  if (Firebase.apps.isNotEmpty) {
    AppLogger.i('🛡️ [FIREBASE SHIELD] Reusing existing Firebase app');
    return;
  }

  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } on FirebaseException catch (error) {
    if (error.code != 'duplicate-app') rethrow;

    AppLogger.i('🛡️ [FIREBASE SHIELD] Reusing native Firebase app');
    Firebase.app();
  }
}

void main() async {
  SentryWidgetsFlutterBinding.ensureInitialized();

  // Initialize Sentry early to capture all startup exceptions
  await SentryFlutter.init(
    (options) {
      options
        ..dsn = AppConfig.sentryDsn
        ..tracesSampleRate = kDebugMode ? 1.0 : 0.1
        ..release = 'ghostclass@${AppConfig.appVersion}'
        ..environment = kDebugMode ? 'development' : 'production'
        ..attachStacktrace = true
        ..enableAutoPerformanceTracing = true;
    },
  );

  HttpOverrides.global = MyHttpOverrides();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    AppLogger.e('Flutter Framework Error', details.exception, details.stack);
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    AppLogger.e('Uncaught Async Error', error, stack);
    return true;
  };

  // Initialize Firebase & App Check
  try {
    await _initializeFirebase();

    // Initialize Analytics after Firebase is ready
    try {
      await AnalyticsService.initialize();
    } on Object catch (_) {
      AppLogger.e('Analytics initialization failed');
    }

    AppLogger.i('🛡️ [FIREBASE SHIELD] Initializing App Check...');
    await SecurityInitializer.initialize();
  } on Object catch (e) {
    AppLogger.e('🛡️ [FIREBASE SHIELD] CRITICAL FAILURE', e);
    await _handleSecurityFailure(e);
    return;
  }

  // Initialize Supabase
  final sUrl = AppConfig.supabaseUrl;
  final sKey = AppConfig.supabasePublishableKey.value;
  final sOrigin = AppConfig.supabaseOrigin;

  await Supabase.initialize(
    url: sUrl,
    anonKey: sKey,
    headers: {
      'Origin': sOrigin,
    },
  );

  await ThemeNotifier.preload();

  // Eagerly pre-warm cryptographic services concurrently while other SDKs/Fonts initialize
  AppLogger.safeUnawait(JweService.instance.preWarm(), 'JWE pre-warm');

  await GoogleFonts.pendingFonts([
    GoogleFonts.manrope(),
    GoogleFonts.firaCode(),
  ]);

  runApp(
    ProviderScope(
      child: SentryWidget(child: const MyApp()),
    ),
  );

  await Sentry.addBreadcrumb(
    Breadcrumb(
      message: 'Supabase Config',
      category: 'auth.config',
      data: {
        'url': sUrl,
        'origin': sOrigin,
        'key_masked': sKey.length > 8
            ? '${sKey.substring(0, 4)}...${sKey.substring(sKey.length - 4)}'
            : '[TOO SHORT]',
      },
    ),
  );
}

/// MyApp
/// -----
/// The root widget of the GhostClass mobile application.
/// Sets up the primary theme, router, and security listeners.
class MyApp extends ConsumerStatefulWidget {
  const MyApp({super.key});

  @override
  ConsumerState<MyApp> createState() => _MyAppState();
}

class _MyAppState extends ConsumerState<MyApp> {
  @override
  void initState() {
    super.initState();
    // Initialize push notification listeners and tokens after layout mounts
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppLogger.safeUnawait(
        ref.read(pushNotificationServiceProvider).initialize(),
        'Push init',
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    return SecurityLockdownListener(
      child: MaterialApp.router(
        title: AppConfig.appName,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: themeMode,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
        builder: (context, child) {
          return child!;
        },
      ),
    );
  }
}
