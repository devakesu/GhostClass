import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'dart:io';

class SecurityLockdownListener extends ConsumerWidget {
  final Widget child;

  const SecurityLockdownListener({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen to the security failure state
    // AuthNotifier handles the stream from DioService and updates this provider
    ref.listen(securityFailureProvider, (previous, next) {
      if (next != null && next.criticalRisk) {
        _handleLockdown(context, next);
      }
    });

    return child;
  }

  void _handleLockdown(BuildContext context, SecurityFailureState state) {
    SecurityUtils.showSecurityFailureDialog(
      context,
      title: state.message,
      message: state.reason ?? 'Your device failed the security verification.',
      technicalDetails: state.source ?? 'Unknown security context.',
      retryLabel: 'Close App',
      onRetry: () => exit(0),
      isDismissible: false,
    );
  }
}
