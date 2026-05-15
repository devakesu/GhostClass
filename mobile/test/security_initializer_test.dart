import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/security_initializer.dart';

void main() {
  test('initialize activates debug providers when isDebug is true', () async {
    var called = false;
    Object? capturedAndroid;
    Object? capturedApple;

    Future<void> fakeActivate({
      Object? providerAndroid,
      Object? providerApple,
    }) async {
      called = true;
      capturedAndroid = providerAndroid;
      capturedApple = providerApple;
    }

    await SecurityInitializer.initialize(
      activateOverride: fakeActivate,
    );

    expect(called, isTrue);
    expect(capturedAndroid, isA<AndroidDebugProvider>());
    expect(capturedApple, isA<AppleDebugProvider>());
  });

  test(
    'initialize activates production providers when isDebug is false',
    () async {
      var called = false;
      Object? capturedAndroid;
      Object? capturedApple;

      Future<void> fakeActivate({
        Object? providerAndroid,
        Object? providerApple,
      }) async {
        called = true;
        capturedAndroid = providerAndroid;
        capturedApple = providerApple;
      }

      await SecurityInitializer.initialize(
        isDebug: false,
        activateOverride: fakeActivate,
      );

      expect(called, isTrue);
      expect(capturedAndroid, isNull);
      expect(
        capturedApple,
        isA<AppleAppAttestWithDeviceCheckFallbackProvider>(),
      );
    },
  );
}
