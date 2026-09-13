import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const {
  processUsersBatch,
  processUserRecord,
  decryptPayload,
  encryptPayload,
} = require("../../scripts/rotate-database-encryption");

describe("rotate-database-encryption script", () => {
  const oldKey = crypto.randomBytes(32);
  const newKey = crypto.randomBytes(32);

  it("encrypts and decrypts payloads accurately", () => {
    const plaintext = "secret_token_12345";
    const encrypted = encryptPayload(plaintext, oldKey);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.content).toBeDefined();

    const decrypted = decryptPayload(encrypted.iv, encrypted.content, oldKey);
    expect(decrypted).toBe(plaintext);
  });

  it("processes user records and re-encrypts with new key", () => {
    const plaintext = "my-ezygo-token";
    const encrypted = encryptPayload(plaintext, oldKey);

    const userRow = {
      id: "user-1",
      ezygo_token: encrypted.content,
      ezygo_iv: encrypted.iv,
    };

    const stats = {
      totalFieldsEncountered: 0,
      fieldsDecryptedSuccessfully: 0,
      fieldsReEncrypted: 0,
      fieldsAlreadyUpgraded: 0,
      fieldsFailedDecryption: 0,
    };

    const result = processUserRecord(userRow, oldKey, newKey, stats);
    expect(result.modified).toBe(true);
    expect(result.updates.ezygo_token).toBeDefined();
    expect(result.updates.ezygo_iv).toBeDefined();
    expect(result.updates.ezygo_iv).not.toBe(encrypted.iv);

    // Verify it decrypts with the new key
    const decryptedWithNewKey = decryptPayload(
      result.updates.ezygo_iv,
      result.updates.ezygo_token,
      newKey,
    );
    expect(decryptedWithNewKey).toBe(plaintext);
  });

  it("performs optimistic concurrency control checking ezygo_iv in processUsersBatch", async () => {
    const plaintext = "my-ezygo-token";
    const encrypted = encryptPayload(plaintext, oldKey);

    const userRow = {
      id: "user-123",
      ezygo_token: encrypted.content,
      ezygo_iv: encrypted.iv,
    };

    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: "user-123" }], error: null });
    const mockEqIv = vi.fn().mockReturnValue({ select: mockSelect });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqIv });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

    const mockSupabase = {
      from: mockFrom,
    };

    const env = {
      oldKeyBuffer: oldKey,
      newKeyBuffer: newKey,
    };

    const stats = {
      totalRowsTraversed: 0,
      rowsModified: 0,
      totalFieldsEncountered: 0,
      fieldsDecryptedSuccessfully: 0,
      fieldsReEncrypted: 0,
      fieldsAlreadyUpgraded: 0,
      fieldsFailedDecryption: 0,
    };

    await processUsersBatch([userRow], mockSupabase, env, stats);

    expect(mockFrom).toHaveBeenCalledWith("users");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockEqId).toHaveBeenCalledWith("id", "user-123");
    expect(mockEqIv).toHaveBeenCalledWith("ezygo_iv", encrypted.iv);
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(stats.rowsModified).toBe(1);
  });

  it("handles concurrency conflict when row is modified concurrently", async () => {
    const plaintext = "token";
    const encrypted = encryptPayload(plaintext, oldKey);

    const userRow = {
      id: "user-456",
      ezygo_token: encrypted.content,
      ezygo_iv: encrypted.iv,
    };

    // Simulate optimistic lock failure (0 rows updated)
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEqIv = vi.fn().mockReturnValue({ select: mockSelect });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqIv });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

    const mockSupabase = { from: mockFrom };
    const env = { oldKeyBuffer: oldKey, newKeyBuffer: newKey };
    const stats = {
      totalRowsTraversed: 0,
      rowsModified: 0,
      totalFieldsEncountered: 0,
      fieldsDecryptedSuccessfully: 0,
      fieldsReEncrypted: 0,
      fieldsAlreadyUpgraded: 0,
      fieldsFailedDecryption: 0,
    };

    await processUsersBatch([userRow], mockSupabase, env, stats);

    expect(stats.rowsModified).toBe(0);
  });
});
