/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
vi.stubGlobal("XMLHttpRequest", undefined);
import * as ReactQuery from "@tanstack/react-query";

describe("React Query Import Sanity", () => {
  it("should import react-query", () => {
    expect(ReactQuery).toBeDefined();
  });
});
