import 'package:flutter_riverpod/flutter_riverpod.dart';

final securityFailureProvider = NotifierProvider<SecurityFailureNotifier, SecurityFailureState?>(
  SecurityFailureNotifier.new,
);

class SecurityFailureState {
  final String message;
  final bool criticalRisk;
  final String? reason;
  final String? action;
  final String? source;

  const SecurityFailureState({
    required this.message,
    this.criticalRisk = false,
    this.reason,
    this.action,
    this.source,
  });
}

class SecurityFailureNotifier extends Notifier<SecurityFailureState?> {
  @override
  SecurityFailureState? build() => null;

  void setFailure(
    String? message, {
    bool criticalRisk = false,
    String? reason,
    String? action,
    String? source,
  }) {
    state = message == null
        ? null
        : SecurityFailureState(
            message: message,
            criticalRisk: criticalRisk,
            reason: reason,
            action: action,
            source: source,
          );
  }

  void clearFailure() => state = null;
}
