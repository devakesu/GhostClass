import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

class SecurityGuard {
  SecurityGuard(this.storage);
  final SecureStorageService storage;
  static const _channel = MethodChannel(
    'com.devakesu.apps.ghostclass/security',
  );

  /// Toggles screenshot/screen recording protection on Android.
  Future<void> setSecureScreen({required bool enabled}) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('setSecureScreen', {'enabled': enabled});
      AppLogger.d(
        'SecurityGuard: secure screen ${enabled ? 'enabled' : 'disabled'}',
      );
    } on Object catch (e) {
      AppLogger.e('SecurityGuard: Failed to set secure screen', e);
    }
  }

  /// Wipes all sensitive storage and exits the app immediately.
  Future<void> wipeAndExit() async {
    AppLogger.e('SecurityGuard: SECURITY BREACH DETECTED. WIPING AND EXITING.');
    try {
      await storage.clearAll();
      if (Platform.isAndroid) {
        await _channel.invokeMethod('exitApp');
      } else {
        exit(0);
      }
    } on Object {
      exit(1);
    }
  }
}

final securityGuardProvider = Provider<SecurityGuard>((ref) {
  return SecurityGuard(ref.read(secureStorageProvider));
});
