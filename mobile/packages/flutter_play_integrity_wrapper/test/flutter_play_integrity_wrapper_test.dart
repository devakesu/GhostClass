import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_play_integrity_wrapper/flutter_play_integrity_wrapper.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const MethodChannel channel = MethodChannel('flutter_play_integrity_wrapper');
  final FlutterPlayIntegrityWrapper wrapper = FlutterPlayIntegrityWrapper();

  test('requestIntegrityToken invokes correct method and arguments', () async {
    final List<MethodCall> log = <MethodCall>[];

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall methodCall) async {
      log.add(methodCall);
      if (methodCall.method == 'requestIntegrityToken') {
        return 'test_token';
      }
      return null;
    });

    final String? token = await wrapper.requestIntegrityToken(
      cloudProjectNumber: '1234567890',
      nonce: 'test_nonce',
    );

    expect(token, 'test_token');
    expect(log, hasLength(1));
    expect(log.first.method, 'requestIntegrityToken');
    expect(log.first.arguments['cloudProjectNumber'], '1234567890');
    expect(log.first.arguments['nonce'], 'test_nonce');

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
}

