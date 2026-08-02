/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import * as FramerMotion from "framer-motion";

describe("Framer Motion Import Sanity", () => {
  it("should import framer-motion", () => {
    expect(FramerMotion).toBeDefined();
  });
});
