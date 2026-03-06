/**
 * Tests for apple-icon.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/og before importing the module under test
// ImageResponse is used with `new`, so it must be a constructable class
vi.mock("next/og", () => ({
  ImageResponse: vi.fn(function (
    this: { type: string; element: unknown; options: unknown },
    element: unknown,
    options: unknown
  ) {
    this.type = "ImageResponse";
    this.element = element;
    this.options = options;
  }),
}));

// Mock fs so readFileSync can be controlled per test
// Node.js built-ins need both default and named exports for CJS/ESM interop
vi.mock("fs", () => {
  const readFileSyncMock = vi.fn().mockReturnValue(Buffer.from("fake-png-data"));
  return {
    default: { readFileSync: readFileSyncMock },
    readFileSync: readFileSyncMock,
  };
});

describe("apple-icon", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should export correct size dimensions", async () => {
    const mod = await import("../apple-icon");
    expect(mod.size).toEqual({ width: 180, height: 180 });
  });

  it("should export correct contentType", async () => {
    const mod = await import("../apple-icon");
    expect(mod.contentType).toBe("image/png");
  });

  it("should export nodejs runtime", async () => {
    const mod = await import("../apple-icon");
    expect(mod.runtime).toBe("nodejs");
  });

  it("should return an ImageResponse", async () => {
    const { ImageResponse } = await import("next/og");
    const mod = await import("../apple-icon");
    const result = mod.default();
    expect(ImageResponse).toHaveBeenCalled();
    expect(result).toHaveProperty("type", "ImageResponse");
  });

  it("should call ImageResponse with size options", async () => {
    const { ImageResponse } = await import("next/og");
    const mod = await import("../apple-icon");
    mod.default();
    expect(ImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 180, height: 180 })
    );
  });

  it("should render without logo when icon file is missing", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    vi.resetModules();

    const { ImageResponse } = await import("next/og");
    const mod = await import("../apple-icon");
    const result = mod.default();
    expect(result).toHaveProperty("type", "ImageResponse");
    expect(ImageResponse).toHaveBeenCalled();
  });
});
