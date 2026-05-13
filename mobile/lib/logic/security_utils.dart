import 'dart:io';
import 'dart:ui';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:ghostclass/widgets/security_error_dialog.dart';

/// SecurityUtils
/// -------------
/// Provides UI utilities for displaying security-related failures and
/// gathering device information for support reports.
class SecurityUtils {
  static Future<void> showSecurityFailureDialog(BuildContext context, {
    required String title,
    required String message,
    required String technicalDetails,
    String? closeLabel,
    String? retryLabel,
    VoidCallback? onRetry,
    bool isDismissible = false,
  }) async {
    final deviceInfo = DeviceInfoPlugin();
    var deviceDetails = 'Unknown Device';

    try {
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        deviceDetails = 'Android ${androidInfo.version.release} (SDK ${androidInfo.version.sdkInt}), ${androidInfo.manufacturer} ${androidInfo.model}, Brand: ${androidInfo.brand}';
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        deviceDetails = 'iOS ${iosInfo.systemVersion}, ${iosInfo.name}, Model: ${iosInfo.model}';
      }
    } on Object {
      // Ignore device info retrieval failures gracefully.
    }

    if (!context.mounted) return;

    await showGeneralDialog(
      context: context,
      barrierLabel: 'Security Error',
      barrierColor: Colors.black.withValues(alpha: 0.5),
      transitionDuration: const Duration(milliseconds: 300),
      pageBuilder: (ctx, anim1, anim2) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: FadeTransition(
          opacity: anim1,
          child: SecurityErrorDialog(
            title: title,
            message: message,
            closeLabel: closeLabel,
            retryLabel: retryLabel,
            onRetry: onRetry,
            isDismissible: isDismissible,
            onContactSupport: () => SupportHelper.contactViaEmail(
              subject: 'Security Failure Report [v${AppConfig.appVersion}]',
              customBody: 'Hi Support,\n\nI encountered a security failure while using the app.\n\n'
                  '-- SUMMARY --\n'
                  'Title: $title\n'
                  'Message: $message\n\n'
                  '-- TECHNICAL DETAILS --\n'
                  'Device: $deviceDetails\n'
                  'Error Context: $technicalDetails\n',
            ),
          ),
        ),
      ),
    );
  }
}
