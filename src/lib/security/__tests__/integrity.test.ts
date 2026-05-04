import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDecode } = vi.hoisted(() => ({
  mockDecode: vi.fn(),
}));

vi.mock("googleapis", () => {
  const JWT = vi.fn().mockImplementation(function() {
    return {};
  });
  const playintegrity = vi.fn().mockImplementation(() => ({
    v1: {
      decodeIntegrityToken: mockDecode,
    },
  }));
  
  return {
    google: {
      auth: { JWT },
      playintegrity,
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("Play Integrity Security", () => {
  const mockToken = "mock-token";
  const mockServiceAccount = JSON.stringify({
    client_email: "test@example.com",
    private_key: "private-key",
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function getSut() {
    return await import("../integrity");
  }

  it("returns error if service account config is missing in production", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("NODE_ENV", "production");
    
    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Server configuration error");
  });

  it("returns error if config missing in development", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("NODE_ENV", "development");
    
    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Server configuration error");
  });

  it("successfully verifies a valid token", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
          accountIntegrity: { appLicensingVerdict: "LICENSED" },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it("rejects if app recognition verdict is not PLAY_RECOGNIZED and enforced", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_PLAY_RECOGNIZED", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED" },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("App not recognized");
  });

  it("verifies nonce if provided", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          requestDetails: { nonce: "valid-nonce" },
          appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken, "valid-nonce");
    expect(result.isValid).toBe(true);

    const resultInvalid = await verifyPlayIntegrity(mockToken, "invalid-nonce");
    expect(resultInvalid.isValid).toBe(false);
    expect(resultInvalid.error).toContain("replay detected");
  });

  it("handles base64 encoded service account json", async () => {
    const { verifyPlayIntegrity } = await getSut();
    const base64Config = Buffer.from(mockServiceAccount).toString("base64");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", base64Config);
    vi.stubEnv("NODE_ENV", "production");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it("rejects if verdict is missing", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    mockDecode.mockResolvedValue({ data: {} });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Empty integrity verdict");
  });

  it("rejects if app licensing fails and enforced", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_LICENSED", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          accountIntegrity: { appLicensingVerdict: "UNLICENSED" },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("not licensed");
  });

  it("verifies certificate digest if enforced", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_SIGNING_CERT", "true");
    vi.stubEnv("PLAY_INTEGRITY_CERT_SHA256", "authorized-hash");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { certificateSha256Digest: ["authorized-hash"] },
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);

    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { certificateSha256Digest: ["wrong-hash"] },
        },
      },
    });
    const resultFail = await verifyPlayIntegrity(mockToken);
    expect(resultFail.isValid).toBe(false);
    expect(resultFail.error).toContain("certificate mismatch");
  });

  it("verifies device integrity levels", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_DEVICE", "true");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_STRONG", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
        },
      },
    });

    const resultFailDevice = await verifyPlayIntegrity(mockToken);
    expect(resultFailDevice.isValid).toBe(false);
    expect(resultFailDevice.error).toContain("verified device check");

    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY", "MEETS_DEVICE_INTEGRITY"] },
        },
      },
    });
    const resultFailStrong = await verifyPlayIntegrity(mockToken);
    expect(resultFailStrong.isValid).toBe(false);
    expect(resultFailStrong.error).toContain("hardware-backed integrity check");
  });

  it("rejects if basic integrity fails in production", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_BASIC", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ["UNKNOWN"] },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("basic integrity check");
  });

  it("handles missing certificates or verdicts in payload", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_SIGNING_CERT", "true");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_DEVICE", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { }, // missing certificateSha256Digest
          deviceIntegrity: { }, // missing deviceRecognitionVerdict
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
  });

  it("handles completely missing appIntegrity or deviceIntegrity", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_SIGNING_CERT", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          // Both missing
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
  });

  it("handles exceptions without response detail", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    
    const error: any = new Error("API Failure");
    error.response = { data: {} }; // No detail field
    mockDecode.mockRejectedValue(error);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
  });

  it("enforces checks regardless of NODE_ENV when env flags are enabled", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_PLAY_RECOGNIZED", "true");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_SIGNING_CERT", "true");
    vi.stubEnv("PLAY_INTEGRITY_ENFORCE_BASIC", "true");
    
    mockDecode.mockResolvedValue({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: "UNEVALUATED", certificateSha256Digest: ["unknown"] },
          deviceIntegrity: { deviceRecognitionVerdict: ["UNKNOWN"] },
        },
      },
    });

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("App not recognized by Play Store");
  });

  it("handles exceptions and logs API error details", async () => {
    const { verifyPlayIntegrity } = await getSut();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
    
    const error: any = new Error("API Failure");
    error.response = { data: { detail: "Rate limit exceeded" } };
    mockDecode.mockRejectedValue(error);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Integrity verification failed");
  });

  it("handles exceptions without response data", async () => {
      const { verifyPlayIntegrity } = await getSut();
      vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
      
      const error: any = new Error("API Failure");
      // response is undefined
      mockDecode.mockRejectedValue(error);

      const result = await verifyPlayIntegrity(mockToken);
      expect(result.isValid).toBe(false);
  });

  it("handles completely missing deviceIntegrity", async () => {
      const { verifyPlayIntegrity } = await getSut();
      vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", mockServiceAccount);
      
      mockDecode.mockResolvedValue({
          data: {
              tokenPayloadExternal: {
                  // deviceIntegrity missing
              },
          },
      });

      const result = await verifyPlayIntegrity(mockToken);
      expect(result.isValid).toBe(true);
  });
});
