/**
 * Tests for the (auth) route-segment loading.tsx file.
 * Next.js renders this component while the auth page is streaming.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock the Loading spinner so it renders a predictable DOM node.
vi.mock("@/components/loading", () => ({
  Loading: () => React.createElement("div", { "data-testid": "auth-loading-spinner" }),
}));

import AuthLoading from "@/app/(auth)/loading";

describe("AuthLoading", () => {
  it("renders without crashing", () => {
    const { container } = render(React.createElement(AuthLoading));
    expect(container).toBeDefined();
  });

  it("renders the Loading spinner", () => {
    render(React.createElement(AuthLoading));
    expect(screen.getByTestId("auth-loading-spinner")).toBeDefined();
  });
});
