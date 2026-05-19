import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
      expect(
        formatApiError('Custom Server Error', 'saving'),
        'Custom Server Error',
      );
    });

    test('handles PostgrestException', () {
      const peRls = PostgrestException(message: 'RLS violation', code: '42501');
      expect(
        formatApiError(peRls, 'adding course'),
        "You don't have permission to add courses to this class. Ensure your profile sync is complete.",
      );
      expect(
        formatApiError(peRls, 'attendance'),
        'Permission denied. You can only modify your own attendance records.',
      );
      expect(
        formatApiError(peRls, 'other'),
        "You don't have permission to perform this action.",
      );

      const peUnique = PostgrestException(
        message: 'Duplicate key',
        code: '23505',
      );
      expect(
        formatApiError(peUnique, 'attendance'),
        'A record already exists for this date and session.',
      );

      expect(
        formatApiError(peUnique, 'adding course'),
        'This course already exists in your class lineup for this semester.',
      );
      expect(formatApiError(peUnique, 'other'), 'This record already exists.');
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
        'EzyGo servers are currently down. Please try again later.',
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
        'Plain error message',
      );

      final dioNetworkErr = DioException(
        requestOptions: RequestOptions(path: '/test'),
        message: 'Network unreachable',
      );
      expect(
        formatApiError(dioNetworkErr, 'loading'),
        'Connection failed. Please check your internet and try again.',
      );

      final dioMapErr = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 400,
          data: {'code': 'ERR_NETWORK', 'message': 'No connection'},
        ),
      );
      expect(
        formatApiError(dioMapErr, 'loading'),
        'Connection failed. Please check your internet and try again.',
      );
    });

    test('handles Map response', () {
      final mapErr = {'code': '429', 'message': 'Too many requests'};
      expect(
        formatApiError(mapErr, 'login'),
        'Too many requests. Please wait a few moments and try again.',
      );

      expect(
        formatApiError({'message': 'technical issues detected'}, 'login'),
        'EzyGo servers are currently down. Please try again later.',
      );
      expect(
        formatApiError({
          'code': '42501',
          'message': 'row-level security',
        }, 'attendance'),
        'Permission denied. You can only modify your own attendance records.',
      );
    });

    test('handles AppException', () {
      const appErr = AppException(
        message: 'Some internal details',
        type: AppExceptionType.forbidden,
        statusCode: 403,
      );
      expect(
        formatApiError(appErr, 'sync'),
        'Access denied. Permission required.',
      );

      const emptyAppErr = AppException(
        message: '',
        type: AppExceptionType.unknown,
        statusCode: 500,
      );
      expect(formatApiError(emptyAppErr, 'sync'), 'Failed to complete sync');
    });

    test('handles 401 and 403 status codes and messages', () {
      final dio401 = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 401,
        ),
      );
      expect(
        formatApiError(dio401, 'fetching'),
        'Session expired. Please log in again.',
      );

      final dio403 = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 403,
        ),
      );
      expect(
        formatApiError(dio403, 'fetching'),
        'Access denied. Permission required.',
      );
    });

    test('handles various specific error codes and messages', () {
      expect(
        formatApiError({'code': '23503'}, 'action'),
        'The related record was not found or has been deleted.',
      );
      expect(
        formatApiError({'code': '22P02'}, 'action'),
        'Invalid data format. Please check your input and try again.',
      );
      expect(
        formatApiError({'message': 'Network error occurred'}, 'action'),
        'Connection failed. Please check your internet and try again.',
      );
      expect(
        formatApiError({'message': 'Too many requests at once'}, 'action'),
        'Too many requests. Please wait a few moments and try again.',
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
      expect(
        sanitizeTechnicalDetails('BearerXYZ and SecretABC and Key123'),
        'Bearer [REDACTED] and Secret [REDACTED] and Key [REDACTED]',
      );
    });
  });
}
