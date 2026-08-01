import { describe, expect, it } from "vitest";
import BuildInfoPage from "../page";

describe("Import Test", () => {
  it("should import BuildInfoPage", () => {
    expect(BuildInfoPage).toBeDefined();
  });
});
