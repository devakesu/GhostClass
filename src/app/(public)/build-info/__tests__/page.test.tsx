/**
 * Tests for BuildInfoPage (Server Component)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BuildInfoPage from "../page";

// Mock navigator.clipboard
const mockWriteText = vi.fn();

Object.defineProperty(global.navigator, "clipboard", {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
  configurable: true,
});

// Mock window.alert
global.alert = vi.fn();

describe("BuildInfoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);

    // Set base environment variables using vi.stubEnv
    vi.stubEnv("APP_COMMIT_SHA", "abc123def456");
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.8.0");
    vi.stubEnv("BUILD_TIMESTAMP", "2026-02-18T15:30:45Z");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
    vi.stubEnv("GITHUB_RUN_ID", "12345");
    vi.stubEnv("GITHUB_RUN_NUMBER", "42");
    vi.stubEnv("AUDIT_STATUS", "PASSED");
    vi.stubEnv("SIGNATURE_STATUS", "SLSA_PROVENANCE_GENERATED");
    vi.stubEnv("IMAGE_DIGEST", "sha256:digest123");
    vi.stubEnv("NODE_ENV", "production");
  });

  it("should render build metadata from environment variables", () => {
    render(<BuildInfoPage />);

    expect(screen.getAllByText("v1.8.0")[0]).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("abc123d")).toBeInTheDocument();
    expect(screen.getByText("2026-02-18")).toBeInTheDocument();
    expect(screen.getByText("15:30:45 UTC")).toBeInTheDocument();
    expect(screen.getAllByText("PASSED").length).toBeGreaterThan(0);
    expect(screen.getByText("SLSA_PROVENANCE_GENERATED")).toBeInTheDocument();
    expect(screen.getByText("sha256:digest123")).toBeInTheDocument();
    expect(screen.getAllByText("PRODUCTION")[0]).toBeInTheDocument();
  });

  it("should handle missing optional environment variables", () => {
    vi.stubEnv("APP_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_RUN_ID", "");
    vi.stubEnv("GITHUB_RUN_NUMBER", "");
    vi.stubEnv("IMAGE_DIGEST", "");
    vi.stubEnv("AUDIT_STATUS", "");

    render(<BuildInfoPage />);

    expect(screen.getAllByText("v1.8.0")[0]).toBeInTheDocument();
    expect(screen.getAllByText("#dev")).toHaveLength(1); // One in BUILD_ID
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument(); // Image digest fallback or similar
  });

  it("should link to GitHub commit and run when repo and IDs are valid", () => {
    render(<BuildInfoPage />);

    const commitLink = screen.getByRole("link", { name: "abc123d" });
    expect(commitLink).toHaveAttribute(
      "href",
      "https://github.com/owner/repo/commit/abc123def456",
    );

    const runLink = screen.getByRole("link", { name: "#42" });
    expect(runLink).toHaveAttribute(
      "href",
      "https://github.com/owner/repo/actions/runs/12345",
    );
  });

  it("should show verified badge for SLSA provenance", () => {
    render(<BuildInfoPage />);
    expect(screen.getByText("✔ Verified")).toBeInTheDocument();
  });
});
