import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

/// ErrorHandlerMixin
/// ----------------
/// A mixin for State classes that provides a centralized method for
/// handling and displaying errors to the user.
mixin ErrorHandlerMixin<T extends StatefulWidget> on State<T> {
  Future<void> handleError(
    dynamic error, {
    String title = 'Error',
    String errorContext = 'operation',
  }) async {
    if (!mounted) return;

    // 1. Detect Security/App Check Failures from the Bridge
    if (error is AppException) {
      final data = error.details;

      // Prioritize structured security errors from the backend
      if (data != null && data['type'] == 'security') {
        final reason = data['reason'] ?? 'Device verification failed';
        final action = data['action'] ?? 'Please try again later';
        final isCritical = data['criticalRisk'] == true;

        var dialogMessage = '$reason';
        if (!isCritical) {
          dialogMessage +=
              '\n\n$action\n\nPlease try again after some time if you think this is a temporary glitch. If the issue persists, contact support.';
        } else {
          dialogMessage += '\n\n$action';
        }

        try {
          await AnalyticsService.instance.logCustom('security_failure', {
            'reason': reason,
            'action': action,
            'critical': isCritical,
          });
        } on Object catch (_) {}
        if (!mounted) return;
        await SecurityUtils.showSecurityFailureDialog(
          context,
          title: 'Security Attestation Failed',
          message: dialogMessage,
          technicalDetails: error.message,
          retryLabel: isCritical ? 'Close App' : 'Restart App',
          onRetry: SystemNavigator.pop,
        );
        return;
      }

      // Fallback: Keyword detection for backward compatibility or unplanned security errors
      if (error.type == AppExceptionType.forbidden ||
          error.type == AppExceptionType.unauthorized) {
        final isSecurityFailure =
            error.message.contains('App Check') ||
            error.message.contains('integrity') ||
            error.message.contains('verification') ||
            error.message.contains('Handshake');

        if (isSecurityFailure) {
          // Fallback errors are treated as non-critical (temp glitch)
          if (!mounted) return;
          await SecurityUtils.showSecurityFailureDialog(
            context,
            title: 'Security Attestation Failed',
            message:
                'GhostClass servers could not verify the integrity of this request. This can happen if your app version is outdated, or your device environment is restricted (Root/Jailbreak/Emulator).\n\nPlease try again after some time if you think this is a temp glitch. If the issue persists, contact support.',
            technicalDetails:
                '${error.type.name.toUpperCase()}: ${error.message}',
            retryLabel: 'Restart App',
            onRetry: SystemNavigator.pop,
          );
          return;
        }
      }
    }

    // 2. Standard Error Handling
    final message = formatApiError(error, errorContext);

    // In debug mode, include the full error object as technical details
    String? details;
    if (kDebugMode) {
      details = error.toString();
      if (error is Error) {
        details += '\n\nStack Trace:\n${error.stackTrace}';
      }
    }

    try {
      await AnalyticsService.instance.logError(message, stack: details);
    } on Object catch (_) {}

    if (!mounted) return;
    await ServiceErrorDialog.show(context, title, [message], details: details);
  }
}
