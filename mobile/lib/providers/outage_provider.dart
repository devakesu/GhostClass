import 'package:flutter_riverpod/flutter_riverpod.dart';

final outageProvider = NotifierProvider<OutageNotifier, bool>(
  OutageNotifier.new,
);

class OutageNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  // ignore: use_setters_to_change_properties, avoid_positional_boolean_parameters -- Matches functional callback signature
  void update(bool value) {
    state = value;
  }
}
