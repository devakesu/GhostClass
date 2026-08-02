import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';
import 'package:ghostclass/services/logger.dart';

/// SecurityInitializer
/// -------------------
/// Handles the initialization and activation of application security layers,
/// primarily Firebase App Check. This class is designed to be testable by
/// allowing dependency injection of the [FirebaseAppCheck] instance.

typedef ActivateFn =
    Future<void> Function({
      Object? providerAndroid,
      Object? providerApple,
    });

/// SecurityInitializer
/// -------------------
/// Handles the initialization and activation of application security layers,
/// primarily Firebase App Check. This class is designed to be testable by
/// allowing dependency injection of the [FirebaseAppCheck] instance.
class SecurityInitializer {
  SecurityInitializer._();

  @visibleForTesting
  static void invokePrivateConstructorForTest() => SecurityInitializer._();

  /// Initializes and activates App Check based on the current build mode.
  ///
  /// [appCheck] can be provided for testing purposes. If null, the default
  /// [FirebaseAppCheck.instance] is used.
  static Future<void> initialize({
    FirebaseAppCheck? appCheck,
    bool isDebug = kDebugMode,
    ActivateFn? activateOverride,

    /// Optional resolver for the `FirebaseAppCheck` instance. Tests can
    /// provide this to avoid referencing the static `FirebaseAppCheck.instance`.
    FirebaseAppCheck Function()? instanceResolver,
  }) async {
    final instanceIfProvided = appCheck;
    final resolveInstance =
        instanceResolver ?? (() => FirebaseAppCheck.instance);

    AppLogger.i('🛡️ [SECURITY] Initializing App Check (isDebug: $isDebug)...');

    if (isDebug) {
      if (activateOverride != null) {
        await activateOverride(
          providerAndroid: const AndroidDebugProvider(),
          providerApple: const AppleDebugProvider(),
        );
      } else {
        final instance = instanceIfProvided ?? resolveInstance();
        await instance.activate(
          providerAndroid: const AndroidDebugProvider(),
          providerApple: const AppleDebugProvider(),
        );
      }
    } else {
      // In production, we use the default Play Integrity provider for Android.
      // For iOS, we use App Attest with a fallback to DeviceCheck to support iOS 13.
      if (activateOverride != null) {
        await activateOverride(
          providerApple: const AppleAppAttestWithDeviceCheckFallbackProvider(),
        );
      } else {
        final instance = instanceIfProvided ?? resolveInstance();
        await instance.activate(
          providerApple: const AppleAppAttestWithDeviceCheckFallbackProvider(),
        );
      }
    }
  }
}
