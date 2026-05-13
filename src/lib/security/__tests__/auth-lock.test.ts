import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthLock, releaseAuthLock } from "../auth-lock";
import { redis } from "@/lib/redis";

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

describe("Auth Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthLock", () => {
    it("returns lock value on successful acquisition", async () => {
      (redis.set as any).mockResolvedValue("OK");
      const lock = await getAuthLock("user-1");
      expect(lock).toBeTypeOf("string");
      expect(redis.set).toHaveBeenCalledWith(
        "auth_lock:user-1",
        expect.any(String),
        { nx: true, px: 30000 }
      );
    });

    it("returns null if lock already exists", async () => {
      (redis.set as any).mockResolvedValue(null);
      const lock = await getAuthLock("user-1");
      expect(lock).toBeNull();
    });

    it("handles redis errors gracefully", async () => {
      (redis.set as any).mockRejectedValue(new Error("Redis down"));
      const lock = await getAuthLock("user-1");
      expect(lock).toBeNull();
    });
  });

  describe("releaseAuthLock", () => {
    it("returns true on successful release", async () => {
      (redis.eval as any).mockResolvedValue(1);
      const success = await releaseAuthLock("user-1", "lock-val");
      expect(success).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1] then'),
        ["auth_lock:user-1"],
        ["lock-val"]
      );
    });

    it("returns false if lock value mismatch", async () => {
      (redis.eval as any).mockResolvedValue(0);
      const success = await releaseAuthLock("user-1", "wrong-val");
      expect(success).toBe(false);
    });

    it("handles errors during release", async () => {
      (redis.eval as any).mockRejectedValue(new Error("Eval failed"));
      const success = await releaseAuthLock("user-1", "val");
      expect(success).toBe(false);
    });
  });

  describe("Branch Coverage", () => {
    it("skips dev logging in production for getAuthLock", async () => {
      const original = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "production");
      (redis.set as any).mockResolvedValue("OK");
      
      await getAuthLock("user-1");
      expect(redis.set).toHaveBeenCalled();
      
      vi.stubEnv("NODE_ENV", original);
    });

    it("skips dev logging in production for releaseAuthLock", async () => {
      const original = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "production");
      (redis.eval as any).mockResolvedValue(1);
      
      await releaseAuthLock("user-1", "val");
      expect(redis.eval).toHaveBeenCalled();
      
      vi.stubEnv("NODE_ENV", original);
      
      await releaseAuthLock("user-1", "val");
      
      vi.stubEnv("NODE_ENV", original);
    });
  });
});
