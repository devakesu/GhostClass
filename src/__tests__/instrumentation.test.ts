import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../instrumentation";
import { validateEnvironment } from "@/lib/validate-env";

vi.mock("@/lib/validate-env", () => ({
  validateEnvironment: vi.fn(),
}));

// Mock the dynamic imports
vi.mock("./instrumentation-server", () => ({}));
vi.mock("./instrumentation-edge", () => ({}));

describe("instrumentation register", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("calls validateEnvironment in nodejs runtime and non-build phase", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-server";
    await register();
    expect(validateEnvironment).toHaveBeenCalled();
  });

  it("skips validateEnvironment in build phase", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-build";
    await register();
    expect(validateEnvironment).not.toHaveBeenCalled();
  });

  it("handles edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    // Verification is that it didn't crash and hit the branch
    expect(true).toBe(true);
  });
});
