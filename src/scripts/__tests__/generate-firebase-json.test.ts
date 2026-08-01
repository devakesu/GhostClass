import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Require commonjs script under test
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateFirebaseJson, generateFirebaseOptionsDart } = require(
  "../../../scripts/generate-firebase-json.js",
);

describe("generate-firebase-json script", () => {
  const tempDir = path.join(__dirname, "__temp_firebase_test__");
  const tempJsonFile = path.join(tempDir, "firebase.json");
  const tempDartFile = path.join(tempDir, "firebase_options.dart");

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips generation when missing required Firebase project/app IDs", () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_ANDROID_APP_ID;
    delete process.env.FIREBASE_ANDROID_APP_ID_NEXUS;

    const result = generateFirebaseJson([], tempJsonFile);
    expect(result).toBe(false);
    expect(fs.existsSync(tempJsonFile)).toBe(false);
  });

  it("generates standard firebase.json and firebase_options.dart from env variables", () => {
    process.env.FIREBASE_PROJECT_ID = "test-project-123";
    process.env.FIREBASE_ANDROID_APP_ID = "1:12345:android:abcdef";
    process.env.FIREBASE_IOS_APP_ID = "1:12345:ios:abcdef";

    const result = generateFirebaseJson([], tempJsonFile);
    expect(result).toBe(true);
    expect(fs.existsSync(tempJsonFile)).toBe(true);

    const jsonContent = JSON.parse(fs.readFileSync(tempJsonFile, "utf8"));
    expect(jsonContent.flutter.platforms.android.default.projectId).toBe(
      "test-project-123",
    );
    expect(jsonContent.flutter.platforms.android.default.appId).toBe(
      "1:12345:android:abcdef",
    );
    expect(jsonContent.flutter.platforms.dart["lib/firebase_options.dart"])
      .toBeDefined();
  });

  it("generates multi-flavor firebase.json from secrets array", () => {
    const secrets = [
      { secretKey: "FIREBASE_PROJECT_ID", secretValue: "nexus-project" },
      {
        secretKey: "FIREBASE_ANDROID_APP_ID_NEXUS",
        secretValue: "1:999:android:nexus",
      },
      {
        secretKey: "FIREBASE_IOS_APP_ID_NEXUS",
        secretValue: "1:999:ios:nexus",
      },
      {
        secretKey: "FIREBASE_ANDROID_APP_ID_NEXUS_MEC",
        secretValue: "1:999:android:mec",
      },
      {
        secretKey: "FIREBASE_IOS_APP_ID_NEXUS_MEC",
        secretValue: "1:999:ios:mec",
      },
    ];

    const result = generateFirebaseJson(secrets, tempJsonFile);
    expect(result).toBe(true);

    const jsonContent = JSON.parse(fs.readFileSync(tempJsonFile, "utf8"));
    expect(jsonContent.flutter.platforms.android.default.appId).toBe(
      "1:999:android:nexus",
    );
    expect(
      jsonContent.flutter.platforms.dart["lib/firebase_options_nexus.dart"],
    ).toBeDefined();
    expect(
      jsonContent.flutter.platforms.dart["lib/firebase_options_nexus_mec.dart"],
    ).toBeDefined();
  });

  it("generates valid firebase_options.dart code content", () => {
    const result = generateFirebaseOptionsDart([], tempDartFile);
    expect(result).toBe(true);
    expect(fs.existsSync(tempDartFile)).toBe(true);

    const content = fs.readFileSync(tempDartFile, "utf8");
    expect(content).toContain("class DefaultFirebaseOptions");
    expect(content).toContain(
      "apiKey: String.fromEnvironment('FIREBASE_API_KEY_ANDROID')",
    );
    expect(content).toContain(
      "projectId: String.fromEnvironment('FIREBASE_PROJECT_ID')",
    );
  });
});
