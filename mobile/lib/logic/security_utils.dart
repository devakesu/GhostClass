import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/widgets/security_error_dialog.dart';
import 'package:url_launcher/url_launcher.dart';

class SecurityUtils {
  static Future<void> showSecurityFailureDialog(BuildContext context, {
    required String title,
    required String message,
    required String technicalDetails,
    String? closeLabel,
    VoidCallback? onRetry,
  }) async {
    final deviceInfo = DeviceInfoPlugin();
    String deviceDetails = 'Unknown Device';

    try {
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        deviceDetails = 'Android ${androidInfo.version.release} (SDK ${androidInfo.version.sdkInt}), ${androidInfo.manufacturer} ${androidInfo.model}, Brand: ${androidInfo.brand}';
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        deviceDetails = 'iOS ${iosInfo.systemVersion}, ${iosInfo.name}, Model: ${iosInfo.model}';
      }
    } catch (_) {}

    if (!context.mounted) return;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => SecurityErrorDialog(
        title: title,
        message: message,
        closeLabel: closeLabel,
        onRetry: onRetry,
        onContactSupport: () async {
          final Uri emailLaunchUri = Uri(
            scheme: 'mailto',
            path: 'support@devakesu.com',
            query: 'subject=Security Failure Report [v${AppConfig.appVersion}]&body=Hi Support,\n\nI encountered a security failure while using the app.\n\n-- TECHNICAL DETAILS --\nDevice: $deviceDetails\nError Context: $technicalDetails\nApp Version: ${AppConfig.appVersion}\nTimestamp: ${DateTime.now().toIso8601String()}\n\n-- PLEASE DESCRIBE WHAT HAPPENED --\n',
          );
          if (await canLaunchUrl(emailLaunchUri)) {
            await launchUrl(emailLaunchUri);
          }
        },
      ),
    );
  }
}
