import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/security_initializer.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseAppCheck extends Mock implements FirebaseAppCheck {}

void main() {
  late MockFirebaseAppCheck mockAppCheck;

  setUp(() {
    mockAppCheck = MockFirebaseAppCheck();

    // Register fallback for activate parameters
    registerFallbackValue(const AndroidDebugProvider());
    registerFallbackValue(const AppleDebugProvider());
    registerFallbackValue(
      const AppleAppAttestWithDeviceCheckFallbackProvider(),
    );
  });

  group('SecurityInitializer', () {
    test('uses Debug providers when isDebug is true', () async {
      when(
        () => mockAppCheck.activate(
          providerAndroid: any(named: 'providerAndroid'),
          providerApple: any(named: 'providerApple'),
          providerWeb: any(named: 'providerWeb'),
        ),
      ).thenAnswer((_) async => {});

      await SecurityInitializer.initialize(
        appCheck: mockAppCheck,
        // ignore: avoid_redundant_argument_values, reason: Explicitly testing both branches
        isDebug: true,
      );

      verify(
        () => mockAppCheck.activate(
          providerAndroid: any(
            named: 'providerAndroid',
            that: isA<AndroidDebugProvider>(),
          ),
          providerApple: any(
            named: 'providerApple',
            that: isA<AppleDebugProvider>(),
          ),
        ),
      ).called(1);
    });

    test('uses Production providers when isDebug is false', () async {
      when(
        () => mockAppCheck.activate(
          providerAndroid: any(named: 'providerAndroid'),
          providerApple: any(named: 'providerApple'),
          providerWeb: any(named: 'providerWeb'),
        ),
      ).thenAnswer((_) async => {});

      await SecurityInitializer.initialize(
        appCheck: mockAppCheck,
        isDebug: false,
      );

      // Note: providerAndroid is NOT explicitly passed in release mode
      // because it defaults to PlayIntegrity in the SDK.
      verify(
        () => mockAppCheck.activate(
          providerApple: any(
            named: 'providerApple',
            that: isA<AppleAppAttestWithDeviceCheckFallbackProvider>(),
          ),
        ),
      ).called(1);
    });
  });
}
