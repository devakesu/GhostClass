# flutter_play_integrity_wrapper

A Flutter plugin wrapper for the Google Play Integrity API on Android.

## Features

- Request an integrity token from the Google Play Integrity API.
- Supports providing a custom nonce or generating a secure random one.

## Getting Started

1. Add `flutter_play_integrity_wrapper` to your `pubspec.yaml` dependencies.
2. Enable the Play Integrity API in your Google Cloud Console project.
3. Link your Google Cloud project to your app in the Google Play Console.

## Usage

Import the package:

```dart
import 'package:flutter_play_integrity_wrapper/flutter_play_integrity_wrapper.dart';
```

Create an instance of `FlutterPlayIntegrityWrapper` and call `requestIntegrityToken`:

```dart
final _playIntegrityWrapper = FlutterPlayIntegrityWrapper();

try {
  // Use your actual Cloud Project Number
  final String? token = await _playIntegrityWrapper.requestIntegrityToken(
    cloudProjectNumber: '1234567890', 
    // optional: nonce: 'your-custom-nonce' 
  );

  if (token != null) {
    print('Integrity Token: $token');
    // OPTIONS FOR VERIFICATION:
    
    // 1. Send to your own backend (Recommended)
    // await myBackend.verify(token);

    // 2. Verify on Firebase (Serverless)
    // See "Firebase Verification" section below.

    // 3. Verify on Device (NOT SECURE - for testing only)
    try {
      final result = await _playIntegrityWrapper.verifyTokenOnDevice(
        token: token,
        packageName: 'com.your.app',
        apiKey: 'YOUR_GOOGLE_CLOUD_API_KEY',
      );
      print('Verification Result: $result');
    } catch (e) {
      // Handle verification error
    }
  }
} on PlayIntegrityException catch (e) {
  print('Play Integrity Error: ${e.code} - ${e.message}');
} catch (e) {
  print('Error requesting integrity token: $e');
}
```

## Token Verification Strategies

### 1. Custom Backend (Recommended)

Send the token to your backend server. The server uses the Google Play Integrity API (java, python, nodejs, etc.) to decrypt and verify the token. This is the most secure method.

### 2. Firebase Cloud Functions

If you use Firebase, you can deploy a Cloud Function to verify the token.
We provide a helper script to generate the necessary Node.js code.

**⚠️ Note:** The Firebase Functions generator script is currently **untested**. Please review the generated code carefully before deploying.

1. Open your terminal and navigate to your Firebase Functions folder: `cd functions`
2. Run the generator script:

   ```bash
   dart run flutter_play_integrity_wrapper:setup_firebase_verification
   ```

3. The script will interactively ask for your Android package name (it tries to auto-detect it) and your preferred response format.
4. This will create `verifyIntegrity.js`. Follow the instructions printed by the script to integrate it into your `index.js`.

### 3. On-Device Verification (NOT SECURE)

**Warning:** This method requires exposing your Google Cloud API Key in your app code. A malicious user could extract this key and abuse your API quota.

Use `verifyTokenOnDevice` only for:

- Prototyping.
- Internal testing.
- Apps with very low security requirements.

```dart
final result = await _playIntegrityWrapper.verifyTokenOnDevice(
  token: token, 
  packageName: 'com.example.app', 
  apiKey: 'API_KEY'
);
```

## Security Note

The `nonce` parameter is optional. If not provided, a secure random nonce is generated automatically. However, for better security against replay attacks, it is highly recommended to generate the nonce on your backend server and pass it to the app.

## Android Configuration

Ensure your `minSdkVersion` in `android/app/build.gradle` is at least 19 (Google Play Services requirement).

This plugin requires Google Play Services to be available on the device.
