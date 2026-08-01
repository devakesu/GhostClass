/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

describe("Require Sanity", () => {
  it("should require axios", async () => {
    const axios = await import("axios");
    expect(axios).toBeDefined();
  });
});
