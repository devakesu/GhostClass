import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadUserAvatar } from "../upload-avatar";
import { createClient } from "@/lib/supabase/client";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    redact: vi.fn((_, val) => val),
  };
});

describe("uploadUserAvatar", () => {
  const mockUser = { id: "user123" };
  const mockFile = new File(["test"], "test.png", { type: "image/png" });

  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
        remove: vi.fn(),
        list: vi.fn(),
      })),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as any).mockReturnValue(mockSupabase);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  });

  it("should upload avatar and update profile successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: {
          publicUrl:
            "https://test.supabase.co/storage/v1/object/public/avatars/user123/123.png",
        },
      }),
      list: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
      remove: vi.fn().mockResolvedValueOnce({ error: null }),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      })),
    });

    const url = await uploadUserAvatar(mockFile);
    expect(url).toContain("https://test.supabase.co");
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("avatars");
    expect(mockSupabase.from).toHaveBeenCalledWith("users");
  });

  it("should throw if not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("Auth error"),
    });

    await expect(uploadUserAvatar(mockFile)).rejects.toThrow(
      "User not authenticated",
    );
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("should throw if file type unsupported", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    const invalidFile = new File(["test"], "test.svg", {
      type: "image/svg+xml",
    });

    await expect(uploadUserAvatar(invalidFile)).rejects.toThrow(
      "Unsupported file type",
    );
  });

  it("should throw if storage upload fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({
        error: { message: "Quota exceeded" },
      }),
    });

    await expect(uploadUserAvatar(mockFile)).rejects.toThrow(
      "Upload failed: Quota exceeded",
    );
  });

  it("should throw if public URL origin mismatch", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://malicious.com/fake.png" },
      }),
    });

    await expect(uploadUserAvatar(mockFile)).rejects.toThrow(
      "Avatar URL origin mismatch",
    );
  });

  it("should throw if profile update fails and attempt cleanup", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://test.supabase.co/1.png" },
      }),
      remove: vi.fn().mockResolvedValueOnce({ error: null }),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: { message: "DB error" } }),
      })),
    });

    await expect(uploadUserAvatar(mockFile)).rejects.toThrow(
      "Profile update failed",
    );
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("avatars");
    // expect remove to be called
  });

  it("should handle cleanup failure gracefully", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://test.supabase.co/1.png" },
      }),
      remove: vi.fn().mockRejectedValueOnce(new Error("Cleanup failed")),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: { message: "DB error" } }),
      })),
    });

    await expect(uploadUserAvatar(mockFile)).rejects.toThrow(
      "Profile update failed",
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it("should perform background cleanup of old avatars", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://test.supabase.co/1.png" },
      }),
      list: vi.fn().mockResolvedValueOnce({
        data: [{ name: "old.png" }],
        error: null,
      }),
      remove: vi.fn().mockResolvedValueOnce({ error: null }),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      })),
    });

    await uploadUserAvatar(mockFile);

    // Wait for background IIFE
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(storageFrom().list).toHaveBeenCalledWith(
      mockUser.id,
      expect.any(Object),
      expect.any(Object),
    );
    expect(storageFrom().remove).toHaveBeenCalledWith([
      `${mockUser.id}/old.png`,
    ]);
  });

  it("should handle background cleanup failure gracefully", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://test.supabase.co/1.png" },
      }),
      list: vi.fn().mockRejectedValueOnce(new Error("List failed")),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      })),
    });

    await uploadUserAvatar(mockFile);

    // Wait for background IIFE
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Background cleanup failed"),
      expect.any(Error),
    );
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("should skip cleanup if no old files exist", async () => {
    const now = 123456789;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const expectedFileName = `${now}.png`;

    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    const storageFrom = mockSupabase.storage.from as any;
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValueOnce({ error: null }),
      getPublicUrl: vi.fn().mockReturnValueOnce({
        data: { publicUrl: "https://test.supabase.co/1.png" },
      }),
      list: vi.fn().mockResolvedValueOnce({
        data: [{ name: expectedFileName }],
        error: null,
      }),
      remove: vi.fn(),
    });

    const from = mockSupabase.from as any;
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      })),
    });

    await uploadUserAvatar(mockFile);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(storageFrom().remove).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
