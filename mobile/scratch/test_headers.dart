// ignore_for_file: avoid_print
import 'package:dio/dio.dart';

void main() {
  final headers = Headers();
  try {
    print('Testing Headers.set...');
    headers.set('content-type', 'application/json');
    print('Success: ${headers.value('content-type')}');
  } catch (e) {
    print('Error: $e');
  }
}
