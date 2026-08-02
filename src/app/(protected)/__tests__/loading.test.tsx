/**
 * Tests for the protected group loading page.
 *
 * This component simply renders the shared <Loading /> component while
 * the protected layout is fetching data. We verify it mounts without
 * errors and delegates rendering to the underlying component.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/loading", () => ({
  Loading: () => (
    <div role="status" aria-label="Loading content">Loading...</div>
  ),
}));

import ProtectedLoading from "../loading";

describe("ProtectedLoading", () => {
  it("renders the Loading component", () => {
    render(<ProtectedLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders without crashing", () => {
    expect(() => render(<ProtectedLoading />)).not.toThrow();
  });
});
