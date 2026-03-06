/**
 * Tests for apple-icon.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stable constructor mock — must be a `function`, not an arrow, to be constructable.
// Using a module-scope constant keeps the same reference across vi.resetModules() calls.
const MockImageResponse = vi.fn(function (
  this: { type: string; element: unknown; options: unknown },
  element: unknown,
  options: unknown
) {
  this.type = "ImageResponse";
  this.element = element;
  this.options = options;
});

vi.mock("next/og", () => ({ ImageResponse: MockImageResponse }));

// Stable mock for the shared icon helper.
const mockReadPublicPngAsDataUri = vi
  .fn()
  .mockReturnValue("data:image/png;base64,ZmFrZQ==");

vi.mock("@/lib/read-public-icon", () => ({
  readPublicPngAsDataUri: mockReadPublicPngAsDataUri,
}));

describe("apple-icon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Restore default icon return value after clearAllMocks resets call history.
    mockReadPublicPngAsDataUri.mockReturnValue("data:image/png;base64,ZmFrZQ==");
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
    const mod = await import("../apple-icon");
    const result = mod.default();
    expect(MockImageResponse).toHaveBeenCalled();
    expect(result).toHaveProperty("type", "ImageResponse");
  });

  it("should call ImageResponse with size options", async () => {
    const mod = await import("../apple-icon");
    mod.default();
    expect(MockImageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 180, height: 180 })
    );
  });

  it("should render without logo when icon file is missing", async () => {
    mockReadPublicPngAsDataUri.mockReturnValueOnce(null);

    const mod = await import("../apple-icon");
    const result = mod.default();
    expect(result).toHaveProperty("type", "ImageResponse");
    expect(MockImageResponse).toHaveBeenCalled();
  });
});

