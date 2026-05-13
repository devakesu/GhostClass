import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/type_utils.dart';

void main() {
  group('Type Utils - toInt', () {
    test('handles integers', () {
      expect(toInt(10), 10);
      expect(toInt(-5), -5);
    });

    test('handles doubles', () {
      expect(toInt(10.5), 10);
      expect(toInt(10.9), 10);
    });

    test('handles strings', () {
      expect(toInt('123'), 123);
      expect(toInt('abc'), null);
    });

    test('handles null and other types', () {
      expect(toInt(null), null);
      expect(toInt({}), null);
    });
  });

  group('AppException', () {
    test('isAuthError returns true for unauthorized/forbidden', () {
      const e1 = AppException(message: 'Unauthorized', type: AppExceptionType.unauthorized);
      expect(e1.isAuthError, true);

      const e2 = AppException(message: 'Forbidden', type: AppExceptionType.forbidden);
      expect(e2.isAuthError, true);

      const e3 = AppException(message: 'Network', type: AppExceptionType.network);
      expect(e3.isAuthError, false);
    });

    test('toString includes type and message', () {
      const e = AppException(message: 'Server Error', type: AppExceptionType.server);
      expect(e.toString(), 'AppException(AppExceptionType.server): Server Error');
    });
  });
}
