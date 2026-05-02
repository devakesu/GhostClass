import { describe, it, expect, vi } from "vitest";
import { safeEzygoJson } from "../ezygo";
import { logger } from "../logger";

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("safeEzygoJson", () => {
  it("returns null if response is not ok", async () => {
    const res = { ok: false } as Response;
    const result = await safeEzygoJson(res);
    expect(result).toBeNull();
  });

  it("returns null for empty response", async () => {
    const res = { 
      ok: true, 
      text: vi.fn().mockResolvedValue("") 
    } as unknown as Response;
    const result = await safeEzygoJson(res);
    expect(result).toBeNull();
  });

  it("parses valid JSON correctly", async () => {
    const data = { foo: "bar" };
    const res = { 
      ok: true, 
      text: vi.fn().mockResolvedValue(JSON.stringify(data)) 
    } as unknown as Response;
    const result = await safeEzygoJson(res);
    expect(result).toEqual(data);
  });

  it("returns raw text if JSON parsing fails", async () => {
    const rawText = "plain string";
    const res = { 
      ok: true, 
      text: vi.fn().mockResolvedValue(rawText) 
    } as unknown as Response;
    const result = await safeEzygoJson(res);
    expect(result).toBe(rawText);
  });

  it("returns null and logs warning if reading text fails", async () => {
    const error = new Error("Read failed");
    const res = { 
      ok: true, 
      text: vi.fn().mockRejectedValue(error) 
    } as unknown as Response;
    const result = await safeEzygoJson(res);
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("[ezygo] safeEzygoJson: failed to read response body:", error);
  });
});
