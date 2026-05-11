import 'dart:io';
import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

/// SupportHelper
/// -------------
/// Provides utility functions for contacting support via the app or email,
/// including pre-filling diagnostic logs for troubleshooting.
class SupportHelper {
  SupportHelper._();

  static const String _persistanceMessage =
      '\n\nIf this issue persists even after some time and repeated attempts, please contact us.';

  /// Navigates to the contact page with pre-filled details.
  static void openContactPage(
    BuildContext context, {
    String? subject,
    String? message,
  }) {
    final fullMessage = (message ?? '') + _persistanceMessage;
    context.push(
      '/contact',
      extra: {
        'subject': subject ?? 'GhostClass Support Request',
        'message': fullMessage,
      },
    );
  }

  /// Opens the default email client with diagnostic logs.
  static Future<void> contactViaEmail({
    String? subject,
    String? customBody,
  }) async {
    final logs = AppLogger.getLogBuffer();
    final body =
        '${customBody ?? 'Describe the issue here...'}$_persistanceMessage\n\n--- DIAGNOSTIC LOGS ---\n$logs\n\nApp Version: ${AppConfig.appVersion}\nOS: ${Platform.operatingSystem} ${Platform.operatingSystemVersion}';

    final emailUri = Uri(
      scheme: 'mailto',
      path: AppConfig.supportEmail,
      query: _encodeQueryParameters({
        'subject': subject ?? 'GhostClass Diagnostic Report',
        'body': body,
      }),
    );

    try {
      if (await canLaunchUrl(emailUri)) {
        await launchUrl(emailUri);
      } else {
        AppLogger.e('SupportHelper: Could not launch email client');
      }
    } catch (e) {
      AppLogger.e('SupportHelper: Email launch error', e);
    }
  }

  static String? _encodeQueryParameters(Map<String, String> params) {
    return params.entries
        .map(
          (e) =>
              '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}',
        )
        .join('&');
  }

  /// Helper to get the correct persistence message for UI display
  static String get persistenceMessage => _persistanceMessage.trim();
}
