/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptRequest, encryptHeader, decryptResponse, __resetJweClientCache } from "../jwe-client";
import { compactDecrypt, CompactEncrypt } from "jose";

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    importJWK: vi.fn().mockResolvedValue({ type: "public" }),
    compactDecrypt: vi.fn(),
    CompactEncrypt: vi.fn().mockImplementation(function() {
      return {
        setProtectedHeader: vi.fn().mockReturnThis(),
        encrypt: vi.fn().mockResolvedValue("mock-jwe-string")
      };
    })
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("JWE Client Security", () => {
  const mockJWKS = {
    keys: [{ use: "enc", alg: "RSA-OAEP-256", kty: "RSA", n: "...", e: "..." }]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetJweClientCache();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockJWKS)
    });
    global.crypto.getRandomValues = vi.fn().mockImplementation((arr) => {
      arr.fill(1);
      return arr;
    });
    Object.defineProperty(global.crypto, 'subtle', {
      value: {
        importKey: vi.fn().mockResolvedValue({ type: "secret" })
      },
      configurable: true
    });
  });

  describe("encryptRequest", () => {
    it("fetches JWKS and encrypts payload", async () => {
      const payload = { test: "data" };
      const { jwe, cek } = await encryptRequest(payload);
      
      expect(jwe).toBe("mock-jwe-string");
      expect(cek).toHaveLength(32);
      expect(fetch).toHaveBeenCalledWith("/api/.well-known/jwks.json");
      expect(CompactEncrypt).toHaveBeenCalled();
    });

    it("throws error if JWKS fetch fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await expect(encryptRequest({})).rejects.toThrow("Failed to fetch JWKS: 500");
    });
  });

  describe("encryptHeader", () => {
    it("encrypts an empty envelope with just rcek", async () => {
      const { jwe, cek } = await encryptHeader();
      expect(jwe).toBe("mock-jwe-string");
      expect(cek).toHaveLength(32);
    });
  });

  describe("decryptResponse", () => {
    it("decrypts valid JWE using provided CEK", async () => {
      const mockCek = new Uint8Array(32).fill(1);
      const mockResult = { data: "secret" };
      (compactDecrypt as any).mockResolvedValue({
        plaintext: new TextEncoder().encode(JSON.stringify(mockResult))
      });

      const result = await decryptResponse("jwe-token", mockCek);
      expect(result).toEqual(mockResult);
    });

    it("throws error on decryption failure", async () => {
      (compactDecrypt as any).mockRejectedValue(new Error("Decryption failed"));
      await expect(decryptResponse("token", new Uint8Array(32))).rejects.toThrow("Failed to decrypt secure response");
    });
  });

  describe("Caching and Edge Cases", () => {
    it("uses cached public key on subsequent calls", async () => {
      await encryptHeader();
      expect(fetch).toHaveBeenCalledTimes(1);
      
      await encryptHeader();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("handles concurrent calls to getPublicKey", async () => {
      __resetJweClientCache();
      const p1 = encryptHeader();
      const p2 = encryptHeader();
      
      await Promise.all([p1, p2]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("throws if no suitable encryption key found in JWKS", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ keys: [{ use: "sig", alg: "RS256" }] })
      });
      
      await expect(encryptHeader()).rejects.toThrow("No suitable encryption key found in JWKS");
    });
  });
});
