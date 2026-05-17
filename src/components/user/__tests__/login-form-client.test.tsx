/**
 * Tests for LoginFormClient — the ssr:false dynamic wrapper that eliminates
 * the login flash by deferring Framer Motion SSR rendering.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/dynamic so the dynamic import resolves synchronously in tests.
vi.mock("next/dynamic", () => ({
  default: (loader: unknown, options?: { loading?: () => React.ReactElement }) => {
    // Execute the loader to cover the dynamic import logic in the host component.
    if (typeof loader === "function") {
      loader();
    }
    const LoadingFallback = options?.loading ?? (() => React.createElement("div", null, "loading"));
    return LoadingFallback;
  },
}));

// Mock the Loading spinner so it renders a predictable DOM node.
vi.mock("@/components/loading", () => ({
  Loading: () => React.createElement("div", { "data-testid": "loading-spinner" }),
}));

// Mock the actual LoginForm so next/dynamic's import() can resolve without
// needing the full component tree.
vi.mock("@/components/user/login-form", () => ({
  LoginForm: () => React.createElement("form", { "data-testid": "login-form" }),
}));

import { LoginFormClient } from "@/components/user/login-form-client";

describe("LoginFormClient", () => {
  it("exports a component", () => {
    expect(LoginFormClient).toBeDefined();
    expect(typeof LoginFormClient).toBe("function");
  });

  it("renders the LoginForm", () => {
    render(React.createElement(LoginFormClient as React.FC));
    // The LoginForm should be rendered directly.
    expect(screen.getByTestId("login-form")).toBeDefined();
  });
});
