import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "../footer";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

describe("Footer", () => {
  it("displays the version from NEXT_PUBLIC_APP_VERSION", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.9.2");
    render(<Footer />);
    expect(screen.getByText("v1.9.2")).toBeInTheDocument();
  });

  it("falls back to 'dev' when NEXT_PUBLIC_APP_VERSION is not set", () => {
    render(<Footer />);
    expect(screen.getByText("vdev")).toBeInTheDocument();
  });
});
