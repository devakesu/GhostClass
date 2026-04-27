// ignore_for_file: avoid_print
import 'dart:io';

void main() {
  print('=========================================================');
  print('Firebase Cloud Function Generator for Play Integrity');
  print('=========================================================');
  print('This script will generate a Node.js file for validating');
  print('Play Integrity tokens using Google Cloud Functions.');
  print('');
  print('Usage: Run this script inside your Firebase "functions" directory.');
  print('');

  final filename = 'verifyIntegrity.js';
  final file = File(filename);

  // 1. Auto-detect package name
  String? packageName = _detectPackageName();
  if (packageName != null) {
    print('Detected Android package name: $packageName');
    print('Press ENTER to use it, or type a different one:');
    final input = stdin.readLineSync()?.trim();
    if (input != null && input.isNotEmpty) {
      packageName = input;
    }
  } else {
    print('Could not detect package name automatically.');
    print('Please enter your Android package name (e.g. com.example.app):');
    packageName = stdin.readLineSync()?.trim();
  }

  if (packageName == null || packageName.isEmpty) {
    print('Error: Package name is required to generate the function.');
    return;
  }

  // 2. Choose Output Format
  print('');
  print('Select the response format for the Cloud Function:');
  print('1) Simplified (isTrusted boolean + raw verdict) [Recommended]');
  print('2) Full Google API JSON Response (Raw data)');
  stdout.write('Enter choice [1]: ');
  final choice = stdin.readLineSync()?.trim();
  final useSimplified = (choice == null || choice.isEmpty || choice == '1');

  if (file.existsSync()) {
    print('WARNING: "$filename" already exists. Overwrite? (y/N)');
    final answer = stdin.readLineSync()?.toLowerCase() ?? 'n';
    if (answer != 'y') {
      print('Aborted.');
      return;
    }
  }

  final String content;

  if (useSimplified) {
      content = _getSimplifiedTemplate(packageName);
  } else {
      content = _getFullTemplate(packageName);
  }

  file.writeAsStringSync(content);

  print('SUCCESS: Created $filename');
  print('');
  print('Next Steps:');
  print('1. Ensure you have installed the required dependency:');
  print('   npm install googleapis');
  print('2. Import this file in your "index.js" or "index.ts" and wrap it in a Callable Function.');
  print('   (See the commented example code at the bottom of generated file)');
  print('3. Deploy your functions: firebase deploy --only functions');
  print('=========================================================');
}

String? _detectPackageName() {
  // Attempt to read from android/app/build.gradle
  try {
    // Try Groovy Gradle file
    final gradleFile = File('../android/app/build.gradle'); // Assuming run from functions/ dir
    if (gradleFile.existsSync()) {
      final content = gradleFile.readAsStringSync();
      // Match applicationId "com.example" or applicationId = "com.example"
      final regex = RegExp(r'''applicationId\s+[=]?\s*["']([^"']+)["']''');
      final match = regex.firstMatch(content);
      if (match != null) return match.group(1);
    }

    // Try Kotlin Script Gradle file
    final ktsFile = File('../android/app/build.gradle.kts');
    if (ktsFile.existsSync()) {
      final content = ktsFile.readAsStringSync();
      final regex = RegExp(r'''applicationId\s*=\s*["']([^"']+)["']''');
      final match = regex.firstMatch(content);
      if (match != null) return match.group(1);
    }
  } catch (e) {
    // ignore
  }
  return null;
}

String _getFullTemplate(String packageName) => r'''
const {google} = require('googleapis');

const PACKAGE_NAME = "''' + packageName + r'''";

/**
 * Verifies the Google Play Integrity Token.
 * 
 * @param {string} integrityToken - The token string from the app.
 * @returns {Promise<object>} - The decoded integrity token payload.
 */
async function verifyIntegrityToken(integrityToken) {
  // Authentication is handled automatically by Firebase Admin / Cloud Functions
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });

  const client = await auth.getClient();
  const playIntegrity = google.playintegrity({
    version: 'v1',
    auth: client,
  });

  try {
    const res = await playIntegrity.v1.decodeIntegrityToken({
      packageName: PACKAGE_NAME,
      body: {
        integrity_token: integrityToken,
      },
    });
    
    return res.data;
  } catch (error) {
    console.error('Error verifying Integrity Token:', error);
    throw new Error('Integrity verification failed');
  }
}

// Example usage with Firebase Callable Function (v2):
/*
const {onCall} = require("firebase-functions/v2/https");
const {verifyIntegrityToken} = require("./verifyIntegrity");

exports.verifyPlayIntegrity = onCall(async (request) => {
  const {token} = request.data;
  if (!token) throw new Error("Missing token");
  
  return await verifyIntegrityToken(token);
});
*/

module.exports = { verifyIntegrityToken };
''';

String _getSimplifiedTemplate(String packageName) => r'''
const {google} = require('googleapis');

const PACKAGE_NAME = "''' + packageName + r'''";

/**
 * Verifies the Google Play Integrity Token.
 * 
 * @param {string} integrityToken - The token string from the app.
 * @returns {Promise<object>} - { isTrusted: boolean, raw: string[] }
 */
async function verifyIntegrityToken(integrityToken) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });

  const client = await auth.getClient();
  const playIntegrity = google.playintegrity({
    version: 'v1',
    auth: client,
  });

  try {
    const res = await playIntegrity.v1.decodeIntegrityToken({
      packageName: PACKAGE_NAME,
      body: {
        integrity_token: integrityToken,
      },
    });
    
    const payload = res.data.tokenPayloadExternal;
    const deviceVerdict = payload?.deviceIntegrity?.deviceRecognitionVerdict || [];
    
    // Check if device meets integrity requirements
    const isTrusted = deviceVerdict.includes("MEETS_DEVICE_INTEGRITY");

    return {
      isTrusted: isTrusted,
      rawVerdict: deviceVerdict,
      // fullResponse: res.data // Uncomment if you need other fields
    };
  } catch (error) {
    console.error('Error verifying Integrity Token:', error);
    throw new Error('Integrity verification failed');
  }
}

// Example usage with Firebase Callable Function (v2):
/*
const {onCall} = require("firebase-functions/v2/https");
const {verifyIntegrityToken} = require("./verifyIntegrity");

exports.verifyPlayIntegrity = onCall(async (request) => {
  const {token} = request.data;
  if (!token) throw new Error("Missing token");
  
  const result = await verifyIntegrityToken(token);
  
  if (!result.isTrusted) {
    throw new Error("Device not trusted");
  }
  
  return { success: true };
});
*/

module.exports = { verifyIntegrityToken };
''';
