import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/config/app_secrets.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:ghostclass/services/security_guard.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/firebase_options.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/widgets/security_error_dialog.dart';

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);

    // Set a global connection timeout to prevent hanging on poisoned system DNS
    client.connectionTimeout = const Duration(seconds: 10);

    // Fix for SSL verification errors that can occur when connecting to raw IPs
    // or when the system cert store is out of sync.
    client.badCertificateCallback =
        (X509Certificate cert, String host, int port) => true;

    return client;
  }
}

void main() async {
  // 1. Initialize the standard stable Flutter binding
  WidgetsFlutterBinding.ensureInitialized();

  // Apply global Bulletproof Networking overrides
  HttpOverrides.global = MyHttpOverrides();
  


  // 2. Initialize Firebase & App Check
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    debugPrint(
      '🛡️ [FIREBASE SHIELD] Initializing App Check for Application ID: com.devakesu.ghostclass',
    );

    if (kDebugMode) {
      await FirebaseAppCheck.instance.activate(
        providerAndroid: AndroidDebugProvider(),
        providerApple: AppleDebugProvider(),
      );
    } else {
      await FirebaseAppCheck.instance.activate(
        providerAndroid: const AndroidPlayIntegrityProvider(),
        providerApple: const AppleAppAttestProvider(),
      );
    }
  } catch (e) {
    debugPrint('🛡️ [FIREBASE SHIELD] CRITICAL FAILURE: $e');

    runApp(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(),
        home: SecurityErrorDialog(
          title: 'Security Handshake Failed',
          message: e.toString().contains('-3')
              ? 'A systemic network error is preventing security attestation. Please check your cellular data or DNS settings.'
              : 'Device attestation failed. This can happen on modified devices or due to configuration mismatches.',
          onRetry: () {
            exit(0); // Restart app
          },
        ),
      ),
    );
    return;
  }

  // 2. Initialize Security Guard
  final storage = SecureStorageService();
  final securityGuard = SecurityGuard(storage);
  await securityGuard.initialize();

  // 3. Initialize Supabase (via Proxy with Spoofed Origin)
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabasePublishableKey.value,
    headers: {'origin': AppSecrets.supabaseSpoofedOrigin},
  );

  await GoogleFonts.pendingFonts([GoogleFonts.manrope()]);

  // 4. Initialize Sentry (Absolute Minimal to prevent native bridge crash)
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      // removing options.debug to bypass Integer-to-Long cast error on Android 15
    },
    appRunner: () {
      debugPrint(
        '🛡️ [FIREBASE SHIELD] App ID: ${DefaultFirebaseOptions.currentPlatform.appId}',
      );
      return runApp(const ProviderScope(child: MyApp()));
    },
  );

  // --- Global Error Handlers ---
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    AppLogger.e(
      'Flutter Framework Error: ${details.exception}',
      details.exception,
      details.stack,
    );
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    AppLogger.e('Uncaught Async Error: $error', error, stack);
    return true;
  };
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    return MaterialApp.router(
      title: AppConfig.appName,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
