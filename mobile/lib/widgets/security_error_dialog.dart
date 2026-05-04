import 'package:flutter/material.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

class SecurityErrorDialog extends StatelessWidget {
  final String title;
  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onContactSupport;
  final String? closeLabel;
  final String? retryLabel;
  final bool isDismissible;

  const SecurityErrorDialog({
    super.key,
    required this.title,
    required this.message,
    this.onRetry,
    this.onContactSupport,
    this.closeLabel,
    this.retryLabel,
    this.isDismissible = false,
  });

  @override
  Widget build(BuildContext context) {
    return ServiceErrorDialog(
      title: title,
      messages: [message],
      onRetry: onRetry,
      onContactSupport: onContactSupport,
      closeLabel: closeLabel,
      retryLabel: retryLabel,
      isDismissible: isDismissible,
    );
  }
}
