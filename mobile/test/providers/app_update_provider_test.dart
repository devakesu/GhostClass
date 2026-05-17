import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/services/security_service.dart';

void main() {
  test('AppUpdateProvider builds default state and updates correctly', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    // Verify initial default state
    final initialState = container.read(appUpdateProvider);
    expect(initialState.checkResult, isNull);
    expect(initialState.dialogDismissed, isFalse);

    // Verify setCheckResult updates state
    final mockResult = AppVersionCheckResult(
      latestVersion: '3.1.0',
      minVersion: '3.0.0',
      hasUpdate: true,
      isForceUpdate: false,
    );

    container.read(appUpdateProvider.notifier).setCheckResult(mockResult);

    final updatedState = container.read(appUpdateProvider);
    expect(updatedState.checkResult, mockResult);
    expect(updatedState.dialogDismissed, isFalse);

    // Verify dismissDialog updates state
    container.read(appUpdateProvider.notifier).dismissDialog();

    final dismissedState = container.read(appUpdateProvider);
    expect(dismissedState.checkResult, mockResult);
    expect(dismissedState.dialogDismissed, isTrue);
  });

  test('AppUpdateState copyWith handles partial updates correctly', () {
    final state = AppUpdateState();
    final mockResult = AppVersionCheckResult(
      latestVersion: '3.1.0',
      minVersion: '3.0.0',
      hasUpdate: true,
      isForceUpdate: false,
    );

    final stateWithResult = state.copyWith(checkResult: mockResult);
    expect(stateWithResult.checkResult, mockResult);
    expect(stateWithResult.dialogDismissed, isFalse);

    final stateWithDismissed = state.copyWith(dialogDismissed: true);
    expect(stateWithDismissed.checkResult, isNull);
    expect(stateWithDismissed.dialogDismissed, isTrue);
  });
}
