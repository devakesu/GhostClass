import { describe, expect, it, vi } from "vitest";
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

  describe("internal link navigation (PWA back-stack safety)", () => {
    it("Legal link navigates in-app (no target='_blank')", () => {
      render(<Footer />);
      const link = screen.getByRole("link", { name: "Legal" });
      expect(link).toHaveAttribute("href", "/legal");
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("Help link navigates in-app (no target='_blank')", () => {
      render(<Footer />);
      const link = screen.getByRole("link", { name: "Help" });
      expect(link).toHaveAttribute("href", "/help");
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("build-info link navigates in-app (no target='_blank', no rel)", () => {
      render(<Footer />);
      const link = screen.getByRole("link", { name: /build provenance/i });
      expect(link).toHaveAttribute("href", "/build-info");
      expect(link).not.toHaveAttribute("target", "_blank");
      expect(link).not.toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("external links retain target='_blank'", () => {
    it("Credits link opens in a new tab with noopener noreferrer", () => {
      render(<Footer />);
      const link = screen.getByRole("link", { name: /credits/i });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
