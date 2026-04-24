import 'package:flutter/material.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

mixin ErrorHandlerMixin<T extends StatefulWidget> on State<T> {
  Future<void> handleError(dynamic error, {String title = 'Error'}) async {
    if (!mounted) return;
    final message = error is String ? error : error.toString();
    await ServiceErrorDialog.show(context, title, [message]);
  }
}
