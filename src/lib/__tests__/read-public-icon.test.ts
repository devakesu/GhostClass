/**
 * Tests for read-public-icon helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Node.js built-ins need both default and named exports for CJS/ESM interop
const readFileSyncMock = vi.fn().mockReturnValue(Buffer.from("fake-png-data"));

vi.mock("fs", () => ({
  default: { readFileSync: readFileSyncMock },
  readFileSync: readFileSyncMock,
}));

vi.mock("path", () => ({
  default: { join: vi.fn((...args: string[]) => args.join("/")) },
}));

describe("readPublicPngAsDataUri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    readFileSyncMock.mockReturnValue(Buffer.from("fake-png-data"));
  });

  it("should return a base64 data URI when the file exists", async () => {
    const { readPublicPngAsDataUri } = await import("@/lib/read-public-icon");
    const result = readPublicPngAsDataUri("icon-192.png");
    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(readFileSyncMock).toHaveBeenCalled();
  });

  it("should include the correct base64 content", async () => {
    const { readPublicPngAsDataUri } = await import("@/lib/read-public-icon");
    const result = readPublicPngAsDataUri("icon-192.png");
    const expected = `data:image/png;base64,${Buffer.from("fake-png-data").toString("base64")}`;
    expect(result).toBe(expected);
  });

  it("should return null when the file cannot be read", async () => {
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    const { readPublicPngAsDataUri } = await import("@/lib/read-public-icon");
    const result = readPublicPngAsDataUri("icon-192.png");
    expect(result).toBeNull();
  });

  it("should call readFileSync with a path containing the filename", async () => {
    const { readPublicPngAsDataUri } = await import("@/lib/read-public-icon");
    readPublicPngAsDataUri("icon-192.png");
    expect(readFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("icon-192.png")
    );
  });
});
