import 'package:flutter/material.dart';
import 'package:flutter_play_integrity_wrapper/flutter_play_integrity_wrapper.dart';
import 'dart:convert';

const String _testNonce =
    "this_is_a_longer_nonce_for_testing_123"; // Example nonce (Base64 encoded)
const String _cloudProjectNumber =
    "123456789"; // REPLACE WITH YOUR GOOGLE CLOUD PROJECT NUMBER

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  String _status = 'Press the button to test';
  final _plugin = FlutterPlayIntegrityWrapper();

  Future<void> _testIntegrity() async {
    setState(() => _status = "Requesting token...");

    try {
      String testNonce = base64Encode(utf8.encode(_testNonce));

      final token = await _plugin.requestIntegrityToken(
        nonce: testNonce,
        cloudProjectNumber: _cloudProjectNumber,
      );

      setState(
        () => _status =
            "SUCCESS!\n\nToken received (truncated):\n${token?.substring(0, 20)}...",
      );
      debugPrint("Full Token: $token");
    } catch (e) {
      setState(() => _status = "FAILED:\n$e");
    }
    debugPrint(_status);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Integrity Test')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text(_status, textAlign: TextAlign.center),
              ),
              ElevatedButton(
                onPressed: _testIntegrity,
                child: const Text('Get Integrity Token'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
