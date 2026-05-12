import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

// Mock Firebase Admin
vi.mock("@/lib/firebase/admin", () => ({
  getAppCheck: vi.fn(),
}));

describe("GET /api/security/attestation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIREBASE_APP_ID_ANDROID = "android-app-id";
    process.env.FIREBASE_APP_ID_IOS = "ios-app-id";
  });

  it("returns error when App Check token is missing", async () => {
    process.env.ENFORCE_APP_CHECK = "true";
    const req = new NextRequest("http://localhost/api/security/attestation", {
      method: "GET",
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.verified).toBe(false);
    expect(data.appCheckError).toBe("Missing mandatory App Check token");
  });

  it("returns error when App Check verifier is unavailable", async () => {
    process.env.ENFORCE_APP_CHECK = "true";
    const { getAppCheck } = await import("@/lib/firebase/admin");
    vi.mocked(getAppCheck).mockReturnValue(null as any);

    const req = new NextRequest("http://localhost/api/security/attestation", {
      method: "GET",
      headers: {
        "X-Firebase-AppCheck": "some-token",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.verified).toBe(false);
    expect(data.appCheckError).toBe("Security Infrastructure Offline");
  });

  it("verifies valid token and extracts claims", async () => {
    const { getAppCheck } = await import("@/lib/firebase/admin");
    const mockDecoded = {
      appId: "android-app-id",
      token: {
        iss: "https://firebaseappcheck.googleapis.com/424804867878",
        sub: "android-app-id",
        aud: ["projects/ghostclass-123"],
        exp: 123456789,
        iat: 123456000,
        app_id: "android-app-id",
        custom_claim: "hello",
      },
    };
    vi.mocked(getAppCheck).mockReturnValue({
      verifyToken: vi.fn().mockResolvedValue(mockDecoded),
    } as any);

    const req = new NextRequest("http://localhost/api/security/attestation", {
      method: "GET",
      headers: {
        "X-Firebase-AppCheck": "valid-token",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.verified).toBe(true);
    expect(data.appId).toBe("android-app-id");
    expect(data.details.custom_claim).toBe("hello");
    expect(data.details.issuer).toBe(mockDecoded.token.iss);
    expect(data.details.exp).toBeUndefined(); // Sensitive key filtered
  });

  it("handles unauthorized App ID", async () => {
    const { getAppCheck } = await import("@/lib/firebase/admin");
    const mockDecoded = {
      appId: "rogue-app-id",
      token: { iss: "test" },
    };
    vi.mocked(getAppCheck).mockReturnValue({
      verifyToken: vi.fn().mockResolvedValue(mockDecoded),
    } as any);

    const req = new NextRequest("http://localhost/api/security/attestation", {
      method: "GET",
      headers: {
        "X-Firebase-AppCheck": "valid-token",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.verified).toBe(false);
    expect(data.criticalRisk).toBe(true);
    expect(data.appCheckError).toBe("Unauthorized Application");
  });

  it("handles verification failure", async () => {
    const { getAppCheck } = await import("@/lib/firebase/admin");
    vi.mocked(getAppCheck).mockReturnValue({
      verifyToken: vi.fn().mockRejectedValue(new Error("Token expired")),
    } as any);

    const req = new NextRequest("http://localhost/api/security/attestation", {
      method: "GET",
      headers: {
        "X-Firebase-AppCheck": "expired-token",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.verified).toBe(false);
    expect(data.appCheckError).toBe("Security Verification Failed");
  });
});
