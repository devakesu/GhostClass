/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decryptRequest, encryptResponse } from "../jwe";
import { compactDecrypt } from "jose";
import { getJwePrivateKey } from "../jwks";

vi.mock("../jwks", () => ({
  getJwePrivateKey: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    compactDecrypt: vi.fn(),
    CompactEncrypt: vi.fn().mockImplementation(function() {
      return {
        setProtectedHeader: vi.fn().mockReturnThis(),
        encrypt: vi.fn().mockResolvedValue("encrypted-token")
      };
    })
  };
});

describe("JWE Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("decryptRequest", () => {
    it("decrypts valid JWE compact string", async () => {
      const mockPayload = { data: "test" };
      const mockPrivateKey = { type: "private" };
      (getJwePrivateKey as any).mockResolvedValue(mockPrivateKey);
      
      (compactDecrypt as any).mockResolvedValue({
        plaintext: new TextEncoder().encode(JSON.stringify(mockPayload))
      });

      const result = await decryptRequest("some-token");
      expect(result).toEqual(mockPayload);
      expect(getJwePrivateKey).toHaveBeenCalled();
    });

    it("throws error and logs warning on decryption failure", async () => {
      (getJwePrivateKey as any).mockResolvedValue({});
      (compactDecrypt as any).mockRejectedValue(new Error("Decryption failed"));

      await expect(decryptRequest("invalid-token")).rejects.toThrow("Invalid encrypted request payload");
      
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to decrypt"),
        expect.objectContaining({ error: "Decryption failed" })
      );
    });

    it("handles non-Error objects in catch block", async () => {
      (getJwePrivateKey as any).mockResolvedValue({});
      (compactDecrypt as any).mockRejectedValue("string error");

      await expect(decryptRequest("token")).rejects.toThrow("Invalid encrypted request payload");
      
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: "string error" })
      );
    });
  });

  describe("encryptResponse", () => {
    it("encrypts payload with valid key", async () => {
      const payload = { hello: "world" };
      const validKeyBase64 = Buffer.from(new Uint8Array(32).fill(1)).toString("base64");
      
      const result = await encryptResponse(payload, validKeyBase64);
      expect(result).toBe("encrypted-token");
    });

    it("throws error for invalid key length", async () => {
      const invalidKeyBase64 = Buffer.from(new Uint8Array(16).fill(1)).toString("base64");
      await expect(encryptResponse({}, invalidKeyBase64)).rejects.toThrow("Invalid response encryption key length");
    });
  });
});
