/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../route";

describe("Android Asset Links (.well-known/assetlinks.json) Route", () => {
  const originalNextPubPackageName =
    process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;
  const originalNextPubFingerprints =
    process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS;
  const originalPackageName = process.env.ANDROID_PACKAGE_NAME;
  const originalFingerprints = process.env.ANDROID_SHA256_FINGERPRINTS;

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;
    delete process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS;
    delete process.env.ANDROID_PACKAGE_NAME;
    delete process.env.ANDROID_SHA256_FINGERPRINTS;

    if (originalNextPubPackageName !== undefined) {
      process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME = originalNextPubPackageName;
    }
    if (originalNextPubFingerprints !== undefined) {
      process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS =
        originalNextPubFingerprints;
    }
    if (originalPackageName !== undefined) {
      process.env.ANDROID_PACKAGE_NAME = originalPackageName;
    }
    if (originalFingerprints !== undefined) {
      process.env.ANDROID_SHA256_FINGERPRINTS = originalFingerprints;
    }
  });

  it("should return default package name and empty fingerprints list when env vars are unset", async () => {
    delete process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;
    delete process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS;
    delete process.env.ANDROID_PACKAGE_NAME;
    delete process.env.ANDROID_SHA256_FINGERPRINTS;

    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].target.package_name).toBe("com.devakesu.apps.ghostclass");
    expect(data[0].target.sha256_cert_fingerprints).toEqual([]);
  });

  it("should support build-time NEXT_PUBLIC_ variables for multiple SHA256 fingerprints", async () => {
    process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME =
      "com.devakesu.apps.ghostclass";
    process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS =
      "82:D2:7B:08:7C:61:2D:C0:83:ED:A4:A4:6E:05:C2:C9:BC:A0:1C:68:3A:77:7C:25:56:77:1B:09:D8:76:C5:D7, AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

    const response = GET();
    const data = await response.json();

    expect(data[0].target.package_name).toBe("com.devakesu.apps.ghostclass");
    expect(data[0].target.sha256_cert_fingerprints).toEqual([
      "82:D2:7B:08:7C:61:2D:C0:83:ED:A4:A4:6E:05:C2:C9:BC:A0:1C:68:3A:77:7C:25:56:77:1B:09:D8:76:C5:D7",
      "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    ]);
  });

  it("should include delegate_permission relations", async () => {
    const response = GET();
    const data = await response.json();

    expect(data[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds",
    ]);
  });
});
