import 'package:flutter_riverpod/flutter_riverpod.dart';

final outageProvider = NotifierProvider<OutageNotifier, bool>(
  OutageNotifier.new,
);

class OutageNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void update(bool value) {
    state = value;
  }
}
