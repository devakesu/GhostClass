import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

mixin ErrorHandlerMixin<T extends StatefulWidget> on State<T> {
  Future<void> handleError(dynamic error, {String title = 'Error', String errorContext = 'operation'}) async {
    if (!mounted) return;
    
    // 1. Detect Security/App Check Failures from the Bridge
    if (error is AppException && error.type == AppExceptionType.forbidden) {
      await SecurityUtils.showSecurityFailureDialog(
        context,
        title: 'Security Attestation Failed',
        message: 'GhostClass servers could not verify the integrity of this request. This can happen if your app version is outdated or your device environment is restricted.',
        technicalDetails: 'AppException[Forbidden]: ${error.message}',
        closeLabel: 'Dismiss',
      );
      return;
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

    await ServiceErrorDialog.show(
      context, 
      title, 
      [message],
      details: details,
    );
  }
}
