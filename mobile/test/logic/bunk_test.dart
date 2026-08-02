import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/bunk.dart';

void main() {
  group('Bunk Calculator - calculateAttendance', () {
    test('handles invalid inputs', () {
      final res1 = calculateAttendance(-1, 10);
      expect(res1.canBunk, 0);
      expect(res1.requiredToAttend, 0);

      final res2 = calculateAttendance(11, 10);
      expect(res2.canBunk, 0);
      expect(res2.requiredToAttend, 0);

      final res3 = calculateAttendance(5, 0);
      expect(res3.canBunk, 0);
      expect(res3.requiredToAttend, 0);
    });

    test('exactly at target', () {
      final res = calculateAttendance(75, 100);
      expect(res.canBunk, 0);
      expect(res.requiredToAttend, 0);
      expect(res.isExact, true);
    });

    test('above target - can bunk', () {
      // 80% attendance, target 75%
      // Bunkable = (100 * 80 - 75 * 100) / 75 = (8000 - 7500) / 75 = 500 / 75 = 6.66 -> 6
      final res = calculateAttendance(80, 100);
      expect(res.canBunk, 6);
      expect(res.requiredToAttend, 0);
      expect(res.isBorderline, false);
    });

    test('below target - required to attend', () {
      // 70% attendance, target 75%
      // Required = (75 * 100 - 100 * 70) / (100 - 75) = (7500 - 7000) / 25 = 500 / 25 = 20
      final res = calculateAttendance(70, 100);
      expect(res.canBunk, 0);
      expect(res.requiredToAttend, 20);
    });

    test('borderline case', () {
      // Target 75%. If we have 15/20 = 75%.
      // If we have 16/21 = 76.19%.
      // If we have 75% but slightly above?
      // bunkableExact = (100 * 75.1 - 75 * 100) / 75 = 0.1 / 75 = 0.0013 -> bunkable 0, borderline true
      final res = calculateAttendance(76, 101);
      // current = 75.24%
      // bunkableExact = (7600 - 7575) / 75 = 25 / 75 = 0.33
      // bunkable = 0, isBorderline = true
      expect(res.canBunk, 0);
      expect(res.isBorderline, true);
    });

    test('target 100% case', () {
      final res = calculateAttendance(9, 10, targetPercentage: 100);
      expect(res.requiredToAttend, 0x7FFFFFFF);
    });

    test('clamped target', () {
      final res = calculateAttendance(50, 100, targetPercentage: 150);
      expect(res.targetPercentage, 100.0);
    });
  });
}
