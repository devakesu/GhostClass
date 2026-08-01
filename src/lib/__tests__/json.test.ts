import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeJsonParse, safeResponseJson } from "../json";
import { logger } from "../logger";

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("json.ts utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("safeJsonParse", () => {
    it("returns null for null, undefined, or empty string", () => {
      expect(safeJsonParse(null)).toBeNull();
      expect(safeJsonParse(undefined)).toBeNull();
      expect(safeJsonParse("")).toBeNull();
      expect(safeJsonParse("   ")).toBeNull();
    });

    it("successfully parses valid JSON", () => {
      const obj = { foo: "bar", baz: 123 };
      const json = JSON.stringify(obj);
      expect(safeJsonParse(json)).toEqual(obj);
    });

    it("returns null and logs warning for invalid JSON", () => {
      const invalidJson = "{ foo: bar }"; // Missing quotes
      const result = safeJsonParse(invalidJson);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        "safeJsonParse: failed to parse JSON",
        expect.objectContaining({ preview: invalidJson.slice(0, 100) }),
      );
    });
  });

  describe("safeResponseJson", () => {
    it("parses valid JSON from response", async () => {
      const obj = { success: true };
      const res = new Response(JSON.stringify(obj));
      const result = await safeResponseJson(res);
      expect(result).toEqual(obj);
    });

    it("handles responses without text() method but with json() (mock support)", async () => {
      const obj = { success: true };
      const res = {
        json: vi.fn().mockResolvedValue(obj),
      } as unknown as Response;

      const result = await safeResponseJson(res);
      expect(result).toEqual(obj);
      expect(res.json).toHaveBeenCalled();
    });

    it("returns null and logs warning when text() throws", async () => {
      const res = {
        text: vi.fn().mockRejectedValue(new Error("Network error")),
      } as unknown as Response;

      const result = await safeResponseJson(res);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        "safeResponseJson: failed to read response body",
        expect.any(Error),
      );
    });

    it("returns null for empty response body", async () => {
      const res = new Response("");
      const result = await safeResponseJson(res);
      expect(result).toBeNull();
    });

    it("returns null for non-JSON response body", async () => {
      const res = new Response("not json");
      const result = await safeResponseJson(res);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
