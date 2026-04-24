import 'package:flutter_riverpod/flutter_riverpod.dart';

final uiModalOpenProvider = NotifierProvider<UiModalOpenNotifier, bool>(
  UiModalOpenNotifier.new,
);

class UiModalOpenNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void setOpen(bool value) {
    state = value;
  }
}
