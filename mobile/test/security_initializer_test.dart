import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/security_initializer.dart';
import 'package:mocktail/mocktail.dart';
// test utils were consolidated into the library under test.
// Ignore redundant-argument lint in tests that explicitly set `isDebug`
// to exercise both branches regardless of analyzer environment.
// ignore_for_file: avoid_redundant_argument_values

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

  // Tests using `instanceResolver` below exercise the same activation
  // branches in a more robust way (injecting a mock instance directly).

  test('invoke private ctor for coverage', () async {
    // Call the testing helper inside the library under test to exercise
    // the private constructor line for coverage.
    SecurityInitializer.invokePrivateConstructorForTest();
  });

  test('initialize uses instanceResolver when provided (debug)', () async {
    final mock = _MockFirebaseAppCheck();

    when(
      () => mock.activate(
        providerAndroid: any(named: 'providerAndroid'),
        providerApple: any(named: 'providerApple'),
      ),
    ).thenAnswer((_) async {});

    // Intentionally pass `isDebug: true` to exercise the debug branch
    // regardless of the analyzer's default `kDebugMode` value.
    await SecurityInitializer.initialize(
      instanceResolver: () => mock,
      isDebug: true,
    );

    verify(
      () => mock.activate(
        providerAndroid: any(named: 'providerAndroid'),
        providerApple: any(named: 'providerApple'),
      ),
    ).called(1);
  });

  test('initialize uses instanceResolver when provided (prod)', () async {
    final mock = _MockFirebaseAppCheck();

    when(
      () => mock.activate(providerApple: any(named: 'providerApple')),
    ).thenAnswer((_) async {});

    await SecurityInitializer.initialize(
      instanceResolver: () => mock,
      isDebug: false,
    );

    verify(
      () => mock.activate(providerApple: any(named: 'providerApple')),
    ).called(1);
  });
}
