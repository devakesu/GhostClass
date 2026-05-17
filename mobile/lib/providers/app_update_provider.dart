import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/security_service.dart';

/// AppUpdateState
/// --------------
/// State object containing the version check result and whether the optional
/// update notification has been dismissed.
class AppUpdateState {
  AppUpdateState({
    this.checkResult,
    this.dialogDismissed = false,
  });

  final AppVersionCheckResult? checkResult;
  final bool dialogDismissed;

  AppUpdateState copyWith({
    AppVersionCheckResult? checkResult,
    bool? dialogDismissed,
  }) {
    return AppUpdateState(
      checkResult: checkResult ?? this.checkResult,
      dialogDismissed: dialogDismissed ?? this.dialogDismissed,
    );
  }
}

class AppUpdateNotifier extends Notifier<AppUpdateState> {
  @override
  AppUpdateState build() => AppUpdateState();

  void setCheckResult(AppVersionCheckResult result) {
    state = state.copyWith(checkResult: result);
  }

  void dismissDialog() {
    state = state.copyWith(dialogDismissed: true);
  }
}

final appUpdateProvider = NotifierProvider<AppUpdateNotifier, AppUpdateState>(
  AppUpdateNotifier.new,
);
