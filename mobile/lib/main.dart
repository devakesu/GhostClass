import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/firebase_options.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:ghostclass/logic/security_initializer.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/logger.dart';
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
      ..connectionTimeout = AppConfig.defaultTimeout;

    // In debug mode, we allow untrusted certificates ONLY if they match our expected hostname.
    // In release mode, standard certificate validation is enforced.
    if (kDebugMode) {
      client.badCertificateCallback = NetworkUtils.validateCertificateHostname;
    }

    return client;
  }
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

class FirebaseInitializer {
  FirebaseInitializer._();
  static Future<void>? _initFuture;
  static Future<void>? get initFuture => _initFuture;
}

void main() async {
  SentryWidgetsFlutterBinding.ensureInitialized();

  // Configure edge-to-edge system UI styling for Android 15 & modern mobile platforms
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // Configure image cache memory limits to optimize bitmap memory usage
  PaintingBinding.instance.imageCache.maximumSize = 100;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 50 * 1024 * 1024; // 50MB

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

  // Initialize Firebase & App Check asynchronously in the background
  FirebaseInitializer._initFuture = () async {
    try {
      await _initializeFirebase();

      // Initialize Analytics after Firebase is ready — do not block startup
      AppLogger.safeUnawait(
        AnalyticsService.initialize().catchError(
          (Object e, StackTrace st) =>
              AppLogger.e('Analytics initialization failed', e, st),
        ),
        'Analytics init',
      );

      AppLogger.i('🛡️ [FIREBASE SHIELD] Initializing App Check...');
      await SecurityInitializer.initialize();
    } on Object catch (e) {
      AppLogger.e('🛡️ [FIREBASE SHIELD] CRITICAL FAILURE', e);
      rethrow;
    }
  }();

  // Initialize Supabase
  final sUrl = AppConfig.supabaseUrl;
  final sKey = AppConfig.supabasePublishableKey.value;
  final sOrigin = AppConfig.supabaseOrigin;

  await Supabase.initialize(
    url: sUrl,
    publishableKey: sKey,
    headers: {
      'Origin': sOrigin,
    },
  );

  await ThemeNotifier.preload();

  // Defer font pre-warm so UI can render faster
  AppLogger.safeUnawait(
    GoogleFonts.pendingFonts([
      GoogleFonts.manrope(),
      GoogleFonts.firaCode(),
    ]),
    'Fonts pre-warm',
  );

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
        'url_configured': sUrl.isNotEmpty,
        'key_length': sKey.length,
        'has_origin': sOrigin.isNotEmpty,
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
          return Semantics(
            label: 'GhostClass',
            child: child,
          );
        },
      ),
    );
  }
}
