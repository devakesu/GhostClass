import 'dart:io';
import 'package:flutter/services.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SecurityGuard {
  final SecureStorageService storage;
  static const _channel = MethodChannel('com.devakesu.ghostclass/security');

  SecurityGuard(this.storage);

  Future<void> initialize() async {}

  /// Toggles screenshot/screen recording protection on Android.
  Future<void> setSecureScreen(bool enabled) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('setSecureScreen', {'enabled': enabled});
      AppLogger.d('SecurityGuard: secure screen ${enabled ? 'enabled' : 'disabled'}');
    } catch (e) {
      AppLogger.e('SecurityGuard: Failed to set secure screen', e);
    }
  }

  /// Wipes all sensitive storage and exits the app immediately.
  Future<void> wipeAndExit() async {
    AppLogger.w('SecurityGuard: SECURITY BREACH DETECTED. WIPING AND EXITING.');
    try {
      await storage.clearAll();
      if (Platform.isAndroid) {
        await _channel.invokeMethod('exitApp');
      } else {
        exit(0);
      }
    } catch (e) {
      exit(1);
    }
  }
}

final securityGuardProvider = Provider<SecurityGuard>((ref) {
  return SecurityGuard(ref.read(secureStorageProvider));
});
