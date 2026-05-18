import { describe, it, expect, beforeEach, vi } from "vitest";
import { encrypt, decrypt, __resetCachedKey } from "../crypto";

describe("crypto.ts", () => {
  const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = VALID_KEY;
    __resetCachedKey();
  });

  it("encrypts and decrypts correctly using object form", () => {
    const text = "Hello, world!";
    const encrypted = encrypt(text);
    
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.content).toContain(":");
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it("decrypts correctly using object destructuring", () => {
    const text = "Secret data";
    const encrypted = encrypt(text);
    
    const decrypted = decrypt({ iv: encrypted.iv, content: encrypted.content });
    expect(decrypted).toBe(text);
  });

  it("throws error if ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    __resetCachedKey();
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY is not defined");
  });

  it("throws error if ENCRYPTION_KEY is invalid length", () => {
    process.env.ENCRYPTION_KEY = "too-short";
    __resetCachedKey();
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be 64 hex characters");
  });

  it("throws error for empty input in encrypt", () => {
    expect(() => encrypt("")).toThrow("Invalid input: text must be a non-empty string");
    // @ts-expect-error - Testing invalid input
    expect(() => encrypt(null)).toThrow("Invalid input");
  });

  it("throws error for too long input in encrypt", () => {
    const longText = "a".repeat(100001);
    expect(() => encrypt(longText)).toThrow("Input text too long");
  });

  it("throws error for invalid IV format in decrypt", () => {
    expect(() => decrypt({ iv: "invalid-iv", content: "tag:content" })).toThrow("Invalid IV format");
  });

  it("throws error for invalid content format (missing separator) in decrypt", () => {
    const iv = "0".repeat(24);
    expect(() => decrypt({ iv, content: "no-separator" })).toThrow("Invalid content format (missing separator)");
  });

  it("throws error for invalid content format (too many separators) in decrypt", () => {
    const iv = "0".repeat(24);
    expect(() => decrypt({ iv, content: "tag:content:extra" })).toThrow("Invalid content format (unexpected separators)");
  });

  it("throws error for non-hex characters in decrypt", () => {
    const iv = "0".repeat(24);
    expect(() => decrypt({ iv, content: "tag:content-with-non-hex!" })).toThrow("Invalid content format (non-hex characters)");
  });

  it("throws error for invalid auth tag length in decrypt", () => {
    const iv = "0".repeat(24);
    expect(() => decrypt({ iv, content: "0123456789abcdef:0123456789abcdef" })).toThrow("Invalid auth tag length");
  });

  it("throws generic error when decryption fails (e.g. wrong key)", () => {
    const text = "test";
    const encrypted = encrypt(text);
    
    // Change key and reset cache
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    __resetCachedKey();
    
    expect(() => decrypt(encrypted)).toThrow("Decryption failed");
  });

  it("caches the encryption key after first use", () => {
    const text = "test";
    encrypt(text);
    
    // Changing the env var should NOT affect encryption/decryption until reset
    process.env.ENCRYPTION_KEY = "f".repeat(64);
    const encrypted2 = encrypt(text);
    expect(decrypt(encrypted2)).toBe(text);
    
    __resetCachedKey();
    // Now it should throw or use new key (and fail decrypting old data)
    expect(() => decrypt(encrypted2)).toThrow("Decryption failed");
  });

  it("does not reset cache in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      encrypt("test");
      process.env.ENCRYPTION_KEY = "f".repeat(64);
      __resetCachedKey(); // Should be a no-op
      expect(decrypt(encrypt("test"))).toBe("test"); // Still uses original cached key
    } finally {
      vi.stubEnv("NODE_ENV", "test");
    }
  });

  it("should throw error for non-hex IV", () => {
    expect(() => decrypt({ iv: "not-a-hex-value-at-all--", content: "tag:content" })).toThrow("Invalid IV format");
  });

  it("throws error for missing IV or content in decrypt", () => {
    expect(() => decrypt(null as any)).toThrow("Invalid input: IV and content are required");
    expect(() => decrypt({ iv: "", content: "" })).toThrow("Invalid input: IV and content are required");
    expect(() => decrypt({ iv: "", content: "test" })).toThrow("Invalid input: IV and content are required");
    expect(() => decrypt({ iv: "123456789012345678901234", content: "" })).toThrow("Invalid input: IV and content are required");
  });
});
