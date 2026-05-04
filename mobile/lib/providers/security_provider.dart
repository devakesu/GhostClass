import 'package:flutter_riverpod/flutter_riverpod.dart';

final securityFailureProvider = NotifierProvider<SecurityFailureNotifier, String?>(
  SecurityFailureNotifier.new,
);

class SecurityFailureNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void setFailure(String? message) {
    state = message;
  }
}
