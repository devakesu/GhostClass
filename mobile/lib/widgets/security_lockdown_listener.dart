import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/security_provider.dart';

import 'package:ghostclass/services/security_guard.dart';

/// SecurityLockdownListener
/// ------------------------
/// A widget that listens for critical security failure states and
/// displays a non-dismissible lockdown dialog to protect user data.
class SecurityLockdownListener extends ConsumerWidget {
  const SecurityLockdownListener({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen to the security failure state
    // AuthNotifier handles the stream from DioService and updates this provider
    ref.listen(securityFailureProvider, (previous, next) {
      if (next != null && next.criticalRisk) {
        _handleLockdown(context, ref, next);
      }
    });

    return child;
  }

  void _handleLockdown(
    BuildContext context,
    WidgetRef ref,
    SecurityFailureState state,
  ) {
    final _ = SecurityUtils.showSecurityFailureDialog(
      context,
      title: state.message,
      message: state.reason ?? 'Your device failed the security verification.',
      technicalDetails: state.source ?? 'Unknown security context.',
      retryLabel: 'Close App',
      onRetry: () => ref.read(securityGuardProvider).wipeAndExit(),
    );
  }
}
