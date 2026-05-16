import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/type_utils.dart';

void main() {
  group('Type Utils - toInt', () {
    test('handles int, double, and string values', () {
      expect(toInt(42), 42);
      expect(toInt(3.14), 3);
      expect(toInt('100'), 100);
      expect(toInt(-50), -50);
      expect(toInt(-3.9), -3);
    });

    test('handles null and invalid string inputs', () {
      expect(toInt(null), isNull);
      expect(toInt('abc'), isNull);
      expect(toInt(''), isNull);
      expect(toInt('12.34'), isNull);
    });

    test('handles edge cases', () {
      expect(toInt(0), 0);
      expect(toInt(0.0), 0);
      expect(toInt('0'), 0);
    });

    test('handles very large numbers', () {
      expect(toInt(9007199254740991), 9007199254740991);
      expect(toInt('999999999999'), 999999999999);
    });
  });
  group('Type Utils - formatBuildTimestamp', () {
    test('formats valid ISO timestamp', () {
      expect(
        formatBuildTimestamp('2026-05-16T09:00:00.000Z'),
        '2026-05-16 09:00',
      );
    });

    test('returns local if input is local', () {
      expect(formatBuildTimestamp('local'), 'local');
    });

    test('returns original if input is invalid', () {
      expect(formatBuildTimestamp('invalid-date'), 'invalid-date');
      expect(formatBuildTimestamp(''), '');
    });
  });
}
