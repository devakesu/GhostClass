import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AcceptTermsClient from "../AcceptTermsClient";

// Mock hooks and components
vi.mock("@/hooks/use-csrf-token", () => ({
  useCSRFToken: vi.fn(),
}));

vi.mock("@/components/legal/AcceptTermsForm", () => ({
  AcceptTermsForm: () => <div data-testid="accept-terms-form" />,
}));

vi.mock("@/components/toaster", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

describe("AcceptTermsClient", () => {
  it("renders correctly", () => {
    render(<AcceptTermsClient />);
    expect(screen.getByTestId("accept-terms-form")).toBeInTheDocument();
    expect(screen.getByTestId("toaster")).toBeInTheDocument();
  });
});
