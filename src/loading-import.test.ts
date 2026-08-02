import { describe, expect, it } from "vitest";
import { Loading } from "./components/loading.tsx";

describe("Loading Import Sanity", () => {
  it("should import Loading", () => {
    expect(Loading).toBeDefined();
  });
});
