#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

/**
/**
 * Helper to retrieve variable from secrets array or process.env.
 * @param {string} key
 * @param {Record<string, string>} envMap
 * @returns {string}
 */
function getVar(key, envMap) {
  if (envMap && typeof envMap === "object") {
    const val = Object.getOwnPropertyDescriptor(envMap, key);
    if (val && val.value) return val.value;
  }
  const envVal = Object.getOwnPropertyDescriptor(process.env, key);
  if (envVal && envVal.value) return envVal.value;
  return "";
}

/**
 * Dynamically generates mobile/lib/firebase_options.dart from Infisical secrets or process.env.
 * @param {string} [targetFile]
 * @returns {boolean}
 */
function generateFirebaseOptionsDart(secrets, targetFile) {
  let targetPath = targetFile;
  if (typeof secrets === "string" && !targetFile) {
    targetPath = secrets;
  } else if (!targetPath) {
    targetPath = path.join(
      process.cwd(),
      "mobile",
      "lib",
      "firebase_options.dart",
    );
  }
  const dartContent = `// File generated dynamically during build workflow.
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'DefaultFirebaseOptions have not been configured for web - '
        'you can reconfigure this by running the FlutterFire CLI again.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_API_KEY_ANDROID'),
    appId: String.fromEnvironment('FIREBASE_ANDROID_APP_ID'),
    messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
    projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_API_KEY_IOS'),
    appId: String.fromEnvironment('FIREBASE_IOS_APP_ID'),
    messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
    projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
    iosBundleId: String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
  );
}
`;

  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, dartContent);
    console.log(`✓ Dynamically generated ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ Could not write ${targetPath}:`, err.message);
    return false;
  }
}

/**
 * Helper to build Dart configurations object for flutter firebase.json.
 */
function buildDartConfigurations(projectId, appIds) {
  const {
    androidAppIdDefault,
    iosAppIdDefault,
    androidAppIdNexus,
    iosAppIdNexus,
    androidAppIdNexusMec,
    iosAppIdNexusMec,
  } = appIds;
  const dartConfigurations = {};

  // Standard lib/firebase_options.dart target
  if (androidAppIdDefault || (!androidAppIdNexus && !androidAppIdNexusMec)) {
    dartConfigurations["lib/firebase_options.dart"] = {
      projectId: projectId,
      configurations: {
        android: androidAppIdDefault,
        ios: iosAppIdDefault,
      },
    };
  }

  // Flavor target: Nexus
  if (androidAppIdNexus) {
    dartConfigurations["lib/firebase_options_nexus.dart"] = {
      projectId: projectId,
      configurations: {
        android: androidAppIdNexus,
        ios: iosAppIdNexus || androidAppIdNexus,
      },
    };
  }

  // Flavor target: Nexus MEC
  if (androidAppIdNexusMec || (androidAppIdNexus && iosAppIdNexusMec)) {
    dartConfigurations["lib/firebase_options_nexus_mec.dart"] = {
      projectId: projectId,
      configurations: {
        android: androidAppIdNexusMec || androidAppIdNexus,
        ios: iosAppIdNexusMec || iosAppIdNexus || androidAppIdNexus,
      },
    };
  }

  return dartConfigurations;
}

/**
 * Dynamically generates mobile/firebase.json from Infisical secrets or process.env.
 * @param {Array<{secretKey: string, secretValue: string}>} [secrets=[]]
 * @param {string} [targetFile]
 * @returns {boolean}
 */
function generateFirebaseJson(secrets = [], targetFile) {
  const envMap = {};
  if (Array.isArray(secrets)) {
    for (const s of secrets) {
      if (s && s.secretKey) {
        envMap[s.secretKey] = s.secretValue;
      }
    }
  }

  const projectId = getVar("FIREBASE_PROJECT_ID", envMap) ||
    getVar("FIREBASE_PROJECT_ID_NEXUS", envMap) ||
    getVar("NEXT_PUBLIC_FIREBASE_PROJECT_ID", envMap);

  const androidAppIdNexus = getVar("FIREBASE_ANDROID_APP_ID_NEXUS", envMap);
  const iosAppIdNexus = getVar("FIREBASE_IOS_APP_ID_NEXUS", envMap);
  const androidAppIdNexusMec = getVar(
    "FIREBASE_ANDROID_APP_ID_NEXUS_MEC",
    envMap,
  );
  const iosAppIdNexusMec = getVar("FIREBASE_IOS_APP_ID_NEXUS_MEC", envMap);

  const androidAppIdDefault = getVar("FIREBASE_ANDROID_APP_ID", envMap) ||
    getVar("FIREBASE_APP_ID_ANDROID", envMap) ||
    androidAppIdNexus;
  const iosAppIdDefault = getVar("FIREBASE_IOS_APP_ID", envMap) ||
    getVar("FIREBASE_APP_ID_IOS", envMap) ||
    iosAppIdNexus ||
    androidAppIdDefault;

  // Check if minimum requirements exist
  if (!projectId || (!androidAppIdDefault && !androidAppIdNexus)) {
    console.log(
      "ℹ️ Skipping mobile/firebase.json generation (missing Firebase project/app IDs).",
    );
    return false;
  }

  const defaultAndroidAppId = androidAppIdNexus || androidAppIdDefault;
  const dartConfigurations = buildDartConfigurations(projectId, {
    androidAppIdDefault,
    iosAppIdDefault,
    androidAppIdNexus,
    iosAppIdNexus,
    androidAppIdNexusMec,
    iosAppIdNexusMec,
  });

  const firebaseJson = {
    flutter: {
      platforms: {
        android: {
          default: {
            projectId: projectId,
            appId: defaultAndroidAppId,
            fileOutput: "android/app/google-services.json",
          },
        },
        dart: dartConfigurations,
      },
    },
  };

  const targetPath = targetFile ||
    path.join(process.cwd(), "mobile", "firebase.json");
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(firebaseJson, null, 2) + "\n");
    console.log(`✓ Dynamically generated ${targetPath}`);

    // Also generate firebase_options.dart with dynamic secret values
    generateFirebaseOptionsDart();

    return true;
  } catch (err) {
    console.warn(`⚠️ Could not write ${targetPath}:`, err.message);
    return false;
  }
}

if (require.main === module) {
  generateFirebaseJson();
}

module.exports = { generateFirebaseJson, generateFirebaseOptionsDart };
