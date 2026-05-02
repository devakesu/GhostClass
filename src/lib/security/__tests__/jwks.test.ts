import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getJwePrivateKey, getJwks, __resetJwksCache } from "../jwks";
import { importPKCS8, exportJWK } from "jose";

vi.mock("jose", () => ({
  importPKCS8: vi.fn(),
  exportJWK: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("JWKS Service", () => {
  const mockPem = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDA...";

  beforeEach(() => {
    vi.clearAllMocks();
    __resetJwksCache();
    vi.stubEnv("JWE_PRIVATE_KEY", mockPem);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getJwePrivateKey", () => {
    it("imports and returns private key from PEM", async () => {
      const mockKey = { type: "private" };
      (importPKCS8 as any).mockResolvedValue(mockKey);

      const key = await getJwePrivateKey();
      expect(key).toBe(mockKey);
      expect(importPKCS8).toHaveBeenCalledWith(mockPem, "RSA-OAEP-256");
    });

    it("handles escaped newlines in PEM string", async () => {
      const escapedPem = "-----BEGIN\\nKEY";
      vi.stubEnv("JWE_PRIVATE_KEY", escapedPem);
      (importPKCS8 as any).mockResolvedValue({});

      await getJwePrivateKey();
      expect(importPKCS8).toHaveBeenCalledWith("-----BEGIN\nKEY", "RSA-OAEP-256");
    });

    it("throws error if JWE_PRIVATE_KEY is missing", async () => {
      vi.stubEnv("JWE_PRIVATE_KEY", "");
      await expect(getJwePrivateKey()).rejects.toThrow("Server misconfiguration: JWE keys not found.");
    });

    it("throws error on import failure", async () => {
      (importPKCS8 as any).mockRejectedValue(new Error("Invalid key"));
      await expect(getJwePrivateKey()).rejects.toThrow("Server misconfiguration: Invalid JWE private key.");
    });
  });

  describe("getJwks", () => {
    it("generates JWKS with public components only", async () => {
      const mockPrivateKey = { type: "private" };
      const mockJwk = { kty: "RSA", n: "n-val", e: "e-val", d: "private-d" };
      
      (importPKCS8 as any).mockResolvedValue(mockPrivateKey);
      (exportJWK as any).mockResolvedValue(mockJwk);

      const jwks = await getJwks();
      
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]).toEqual({
        kty: "RSA",
        n: "n-val",
        e: "e-val",
        kid: "ghostclass-v1",
        alg: "RSA-OAEP-256",
        use: "enc",
        key_ops: ["wrapKey", "encrypt"],
      });
      // Ensure 'd' is NOT leaked
      expect(jwks.keys[0].d).toBeUndefined();
    });

    it("throws error if JWKS generation fails", async () => {
      (importPKCS8 as any).mockRejectedValue(new Error("Fail"));
      await expect(getJwks()).rejects.toThrow("Internal Server Error: JWKS generation failed.");
    });

    it("throws error if JWE_PRIVATE_KEY is missing for getJwks", async () => {
      vi.stubEnv("JWE_PRIVATE_KEY", "");
      await expect(getJwks()).rejects.toThrow("JWE: Missing JWE_PRIVATE_KEY.");
    });
  });

  describe("Caching", () => {
    it("returns cached private key", async () => {
      (importPKCS8 as any).mockResolvedValue({ id: 1 });
      const k1 = await getJwePrivateKey();
      const k2 = await getJwePrivateKey();
      expect(k1).toBe(k2);
      expect(importPKCS8).toHaveBeenCalledTimes(1);
    });

    it("returns cached jwks", async () => {
      (importPKCS8 as any).mockResolvedValue({});
      (exportJWK as any).mockResolvedValue({ kty: "RSA" });
      const j1 = await getJwks();
      const j2 = await getJwks();
      expect(j1).toBe(j2);
      expect(importPKCS8).toHaveBeenCalledTimes(1);
    });
  });
});
