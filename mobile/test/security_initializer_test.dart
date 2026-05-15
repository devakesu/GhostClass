import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/security_initializer.dart';
import 'package:mocktail/mocktail.dart';

class _MockFirebaseAppCheck extends Mock implements FirebaseAppCheck {}

void main() {
  setUpAll(() {
    registerFallbackValue(const AndroidDebugProvider());
    registerFallbackValue(const AppleDebugProvider());
    registerFallbackValue(
      const AppleAppAttestWithDeviceCheckFallbackProvider(),
    );
  });
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

  test(
    'initialize calls instance.activate when appCheck provided (debug)',
    () async {
      final mock = _MockFirebaseAppCheck();

      when(
        () => mock.activate(
          providerAndroid: any(named: 'providerAndroid'),
          providerApple: any(named: 'providerApple'),
        ),
      ).thenAnswer((_) async {});

      await SecurityInitializer.initialize(appCheck: mock);

      verify(
        () => mock.activate(
          providerAndroid: any(named: 'providerAndroid'),
          providerApple: any(named: 'providerApple'),
        ),
      ).called(1);
    },
  );

  test(
    'initialize calls instance.activate when appCheck provided (prod)',
    () async {
      final mock = _MockFirebaseAppCheck();

      when(
        () => mock.activate(providerApple: any(named: 'providerApple')),
      ).thenAnswer((_) async {});

      await SecurityInitializer.initialize(appCheck: mock, isDebug: false);

      verify(
        () => mock.activate(providerApple: any(named: 'providerApple')),
      ).called(1);
    },
  );
}
