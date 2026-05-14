import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';

void main() {
  group('AppException', () {
    test('constructs with all fields', () {
      final error = Exception('Original');
      final appEx = AppException(
        message: 'Auth failed',
        type: AppExceptionType.unauthorized,
        originalError: error,
        statusCode: 401,
        details: {'realm': 'test'},
      );

      expect(appEx.message, 'Auth failed');
      expect(appEx.type, AppExceptionType.unauthorized);
      expect(appEx.originalError, error);
      expect(appEx.statusCode, 401);
      expect(appEx.details?['realm'], 'test');
    });

    test('isAuthError identifies authorization errors', () {
      expect(
        const AppException(
          message: 'Unauthorized',
          type: AppExceptionType.unauthorized,
        ).isAuthError,
        true,
      );
      expect(
        const AppException(
          message: 'Forbidden',
          type: AppExceptionType.forbidden,
        ).isAuthError,
        true,
      );
      expect(
        const AppException(
          message: 'Server error',
          type: AppExceptionType.server,
        ).isAuthError,
        false,
      );
    });

    test('toString formats exception info', () {
      const appEx = AppException(
        message: 'Network timeout',
        type: AppExceptionType.network,
      );

      expect(
        appEx.toString(),
        'AppException(AppExceptionType.network): Network timeout',
      );
    });

    test('all exception types are accessible', () {
      expect(AppExceptionType.unknown, AppExceptionType.unknown);
      expect(AppExceptionType.network, AppExceptionType.network);
      expect(AppExceptionType.unauthorized, AppExceptionType.unauthorized);
      expect(AppExceptionType.forbidden, AppExceptionType.forbidden);
      expect(AppExceptionType.rateLimit, AppExceptionType.rateLimit);
      expect(AppExceptionType.server, AppExceptionType.server);
    });
  });
}
