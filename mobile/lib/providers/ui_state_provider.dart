import 'package:flutter_riverpod/flutter_riverpod.dart';

final uiModalOpenProvider = NotifierProvider<UiModalOpenNotifier, bool>(
  UiModalOpenNotifier.new,
);

class UiModalOpenNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  // ignore: use_setters_to_change_properties, avoid_positional_boolean_parameters -- Matches functional callback signature
  void setOpen(bool value) {
    state = value;
  }
}
