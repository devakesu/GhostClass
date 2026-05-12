import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/logic/app_exception.dart';

void main() {
  group('Error Utils - formatApiError', () {
    test('handles null responses', () {
      expect(
        formatApiError(null, 'ApiService.Dio'),
        'Connectivity problem: The server is taking too long to respond.',
      );
      expect(
        formatApiError(null, 'Tracking.OfficialReport'),
        'The attendance report is currently unavailable. Please check your connection and try again.',
      );
      expect(formatApiError(null, 'saving'), 'Failed to complete saving');
    });

    test('handles string responses', () {
      expect(formatApiError('Custom Server Error', 'saving'), 'Custom Server Error');
    });

    test('handles PostgrestException', () {
      final peRls = PostgrestException(message: 'RLS violation', code: '42501');
      expect(
        formatApiError(peRls, 'adding course'),
        "You don't have permission to add courses to this class. Ensure your profile sync is complete.",
      );
      expect(
        formatApiError(peRls, 'attendance'),
        "Permission denied. You can only modify your own attendance records.",
      );
      expect(
        formatApiError(peRls, 'other'),
        "You don't have permission to perform this action.",
      );

      final peUnique = PostgrestException(message: 'Duplicate key', code: '23505');
      expect(
        formatApiError(peUnique, 'attendance'),
        "A record already exists for this date and session.",
      );
    });

    test('handles DioException', () {
      final dioErr = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 503,
          data: {'message': 'Server Overloaded'},
        ),
      );
      expect(
        formatApiError(dioErr, 'fetching'),
        "EzyGo servers are currently down. Please try again later.",
      );

      final dioStringErr = DioException(
        requestOptions: RequestOptions(path: '/test'),
        message: 'Plain error message',
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 400,
          data: 'Bad Request String',
        ),
      );
      expect(
        formatApiError(dioStringErr, 'fetching'),
        "Plain error message",
      );
    });

    test('handles Map response', () {
      final mapErr = {'code': '429', 'message': 'Too many requests'};
      expect(
        formatApiError(mapErr, 'login'),
        "Too many requests. Please wait a few moments and try again.",
      );
    });

    test('handles AppException', () {
      const appErr = AppException(
        message: 'Forbidden action',
        type: AppExceptionType.forbidden,
        statusCode: 403,
      );
      expect(formatApiError(appErr, 'sync'), 'Forbidden action');
    });

    test('handles various specific error codes and messages', () {
      expect(
        formatApiError({'code': '23503'}, 'action'),
        "The related record was not found or has been deleted.",
      );
      expect(
        formatApiError({'code': '22P02'}, 'action'),
        "Invalid data format. Please check your input and try again.",
      );
      expect(
        formatApiError({'message': 'Network error occurred'}, 'action'),
        "Connection failed. Please check your internet and try again.",
      );
    });
  });

  group('Error Utils - sanitizeTechnicalDetails', () {
    test('redacts IP addresses', () {
      expect(
        sanitizeTechnicalDetails('Error at 192.168.1.1 timed out'),
        'Error at [REDACTED_IP] timed out',
      );
    });

    test('redacts ports', () {
      expect(
        sanitizeTechnicalDetails('Failed to bind to port:8080'),
        'Failed to bind to port = [REDACTED]',
      );
      expect(
        sanitizeTechnicalDetails('Connection to localhost:5432 failed'),
        'Connection to localhost:[REDACTED_PORT] failed',
      );
    });

    test('redacts absolute Unix-like paths', () {
      expect(
        sanitizeTechnicalDetails('File not found at /usr/local/bin/app'),
        'File not found at [REDACTED_PATH]',
      );
    });

    test('redacts auth tokens', () {
      expect(
        sanitizeTechnicalDetails('URL parameter token=abcde12345 expired'),
        'URL parameter token [REDACTED] expired',
      );
    });
  });
}
