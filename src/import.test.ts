/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import ScoresClient from "./app/(protected)/scores/ScoresClient.tsx";

describe("Import Sanity", () => {
  it("should import ScoresClient", () => {
    expect(ScoresClient).toBeDefined();
  });
});
