import 'package:flutter/material.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/widgets/service_error_dialog.dart';

mixin ErrorHandlerMixin<T extends StatefulWidget> on State<T> {
  Future<void> handleError(dynamic error, {String title = 'Error', String errorContext = 'operation'}) async {
    if (!mounted) return;
    
    final message = formatApiError(error, errorContext);
    await ServiceErrorDialog.show(context, title, [message]);
  }
}
