import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/config/app_config.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:ghostclass/firebase_options.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/logic/network_utils.dart';
import 'package:ghostclass/widgets/security_lockdown_listener.dart';

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.connectionTimeout = kDebugMode ? const Duration(seconds: 40) : const Duration(seconds: 20);
    
    // In debug mode, we allow untrusted certificates ONLY if they match our expected hostname.
    // In release mode, standard certificate validation is enforced.
    if (kDebugMode) {
      client.badCertificateCallback = NetworkUtils.validateCertificateHostname;
    }
    
    return client;
  }
}

class _SecurityFailureApp extends StatelessWidget {
  final String friendlyMessage;
  final String technicalDetails;

  const _SecurityFailureApp({
    required this.friendlyMessage,
    required this.technicalDetails,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(),
      home: Builder(
        builder: (context) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            SecurityUtils.showSecurityFailureDialog(
              context,
              title: 'Security Handshake Failed',
              message: friendlyMessage,
              technicalDetails: technicalDetails,
              retryLabel: 'Close App',
              onRetry: () => exit(0),
              isDismissible: false,
            );
          });
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        },
      ),
    );
  }
}

Future<void> _handleSecurityFailure(Object error) async {
  final String errorMessage = error.toString();
  final String friendlyMessage = errorMessage.contains('-3')
      ? 'GhostClass encountered a network security issue while verifying your device. This often happens on restricted WiFi or with custom DNS settings.'
      : 'We couldn\'t verify the integrity of this app. To protect your data, GhostClass requires a secure, unmodified environment.';

  runApp(_SecurityFailureApp(friendlyMessage: friendlyMessage, technicalDetails: errorMessage));
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  

  HttpOverrides.global = MyHttpOverrides();
  
  // Initialize Firebase & App Check
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    debugPrint('🛡️ [FIREBASE SHIELD] Initializing App Check...');

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

  await GoogleFonts.pendingFonts([GoogleFonts.manrope()]);

  // Initialize Sentry
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.tracesSampleRate = 1.0; // Capturing 100% of transactions for debugging
      options.release = 'ghostclass@${AppConfig.appVersion}';
      options.environment = kDebugMode ? 'development' : 'production';
      options.attachStacktrace = true;
      options.enableAutoPerformanceTracing = true;
    },
    appRunner: () {
      return runApp(const ProviderScope(child: MyApp()));
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

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
