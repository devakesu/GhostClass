import 'dart:io';

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/firebase_options.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/router/app_router.dart';
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
          : const Duration(seconds: 20);

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
              retryLabel: 'Close App',
              onRetry: () => exit(0),
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

void main() async {
  SentryWidgetsFlutterBinding.ensureInitialized();

  HttpOverrides.global = MyHttpOverrides();

  // Initialize Firebase & App Check
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    AppLogger.i('🛡️ [FIREBASE SHIELD] Initializing App Check...');

    if (kDebugMode) {
      await FirebaseAppCheck.instance.activate(
        providerAndroid: const AndroidDebugProvider(),
        providerApple: const AppleDebugProvider(),
      );
    } else {
      await FirebaseAppCheck.instance.activate(
        providerApple: const AppleAppAttestProvider(),
      );
    }
  } on Object catch (e) {
    AppLogger.e('🛡️ [FIREBASE SHIELD] CRITICAL FAILURE', e);
    await _handleSecurityFailure(e);
    return;
  }

  // Initialize Supabase
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabasePublishableKey.value,
    headers: {
      'Origin': AppConfig.supabaseOrigin,
    },
  );

  await GoogleFonts.pendingFonts([
    GoogleFonts.manrope(),
    GoogleFonts.firaCode(),
  ]);

  // Initialize Sentry
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
    appRunner: () {
      return runApp(
        ProviderScope(
          child: SentryWidget(child: const MyApp()),
        ),
      );
    },
  );

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    AppLogger.e('Flutter Framework Error', details.exception, details.stack);
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    AppLogger.e('Uncaught Async Error', error, stack);
    return true;
  };
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
      final _ = ref.read(pushNotificationServiceProvider).initialize();
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
