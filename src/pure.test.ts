import { describe, expect, it } from "vitest";

describe("Pure Vitest Sanity", () => {
  it("should work", () => {
    expect(Array.isArray([])).toBe(true);
  });
});
