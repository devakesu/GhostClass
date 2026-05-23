import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/security_utils.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/router/app_router.dart';
import 'package:ghostclass/services/logger.dart';
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
    if (Platform.isIOS) {
      // Wipe storage immediately on iOS since we won't show the exit button
      AppLogger.safeUnawait(
        ref.read(securityGuardProvider).wipeAndExit(),
        'SecurityLockdownListener: wipeAndExit',
      );
    }
    final navContext = rootNavigatorKey.currentContext ?? context;
    final _ = SecurityUtils.showSecurityFailureDialog(
      navContext,
      title: state.message,
      message: state.reason ?? 'Your device failed the security verification.',
      technicalDetails: state.source ?? 'Unknown security context.',
      retryLabel: Platform.isAndroid ? 'Close App' : null,
      onRetry: Platform.isAndroid
          ? () => ref.read(securityGuardProvider).wipeAndExit()
          : null,
    );
  }
}
