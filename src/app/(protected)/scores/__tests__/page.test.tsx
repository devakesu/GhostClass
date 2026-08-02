import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoresPage from "../page";

vi.mock("../ScoresClient", () => ({
  default: () => <div data-testid="scores-client">ScoresClient</div>,
}));

vi.mock("@/components/loading", () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

describe("ScoresPage", () => {
  it("renders ScoresClient within Suspense", () => {
    render(<ScoresPage />);
    expect(screen.getByTestId("scores-client")).toBeDefined();
  });
});
