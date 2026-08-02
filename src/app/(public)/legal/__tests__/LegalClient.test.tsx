import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LegalClient from "../LegalClient";

// Mock ReactMarkdown to trigger components and their branches
vi.mock("react-markdown", () => ({
  default: ({ components, children }: any) => (
    <div data-testid="markdown">
      {children}
      {/* Trigger h1 */}
      {components?.h1?.({ children: "H1" })}
      {/* Trigger p */}
      {components?.p?.({ children: "P" })}
      {/* Trigger ul */}
      {components?.ul?.({ children: "UL" })}
      {/* Trigger ol */}
      {components?.ol?.({ children: "OL" })}
      {/* Trigger li normal */}
      {components?.li?.({
        node: { parent: { tagName: "ul" } },
        children: "LI Normal",
      })}
      {/* Trigger li fallback */}
      {components?.li?.({ node: {}, children: "LI Fallback" })}
      {/* Trigger strong */}
      {components?.strong?.({ children: "Strong" })}
      {/* Trigger a external */}
      {components?.a?.({ href: "https://google.com", children: "External" })}
      {/* Trigger a internal */}
      {components?.a?.({ href: "/contact", children: "Internal" })}
    </div>
  ),
}));

// Mock the legal config
vi.mock("@/app/config/legal", () => ({
  TERMS_VERSION: "1.0",
  LEGAL_EFFECTIVE_DATE: "2026-01-01",
  BUNK_DISCLAIMER: "Disclaimer text",
  TERMS_OF_SERVICE:
    "# Header 1\n\n**Bold Text**\n\n[Link](https://example.com)\n\n1. Item 1\n2. Item 2\n\n* Bullet A",
  PRIVACY_POLICY: "Privacy text\n\n* Item A",
  COOKIE_POLICY: "Cookie text",
}));

describe("LegalClient", () => {
  it("renders all sections and handles components", () => {
    render(<LegalClient />);
    expect(screen.getByText("Legal Policies")).toBeInTheDocument();

    // Check if our mocked components were triggered
    // Since there are 4 PolicySections, these will appear 4 times
    expect(screen.getAllByText("LI Normal")[0]).toBeInTheDocument();
    expect(screen.getAllByText("LI Fallback")[0]).toBeInTheDocument();
    expect(screen.getAllByText("External")[0]).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getAllByText("Internal")[0]).not.toHaveAttribute("target");
  });
});
