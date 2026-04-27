import 'package:flutter/material.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

class SecurityErrorDialog extends StatelessWidget {
  final String title;
  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onContactSupport;
  final String? closeLabel;

  const SecurityErrorDialog({
    super.key,
    required this.title,
    required this.message,
    this.onRetry,
    this.onContactSupport,
    this.closeLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ServiceErrorDialog(
          title: title,
          messages: [message],
          onRetry: onRetry,
          onContactSupport: onContactSupport,
          closeLabel: closeLabel,
          isDismissible: false,
        ),
      ),
    );
  }
}
