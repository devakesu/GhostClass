/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { OutageProvider, useOutage } from "../outage-provider";

vi.mock("@/components/service-error-view", () => ({
  ServiceErrorView: ({ messages, error }: { messages: string[]; error?: string }) => (
    <div data-testid="error-view">
      <div data-testid="messages">{messages[0]}</div>
      <div data-testid="details">{error}</div>
    </div>
  ),
}));

describe("OutageProvider Minimal", () => {
  it("renders children", () => {
    render(
      <OutageProvider>
        <div data-testid="child">Child</div>
      </OutageProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("shows error view when outage is set", async () => {
    const TestComponent = () => {
      const { setOutage } = useOutage();
      return <button data-testid="set" onClick={() => setOutage(["Error"], "500")}>Set</button>;
    };

    render(
      <OutageProvider>
        <TestComponent />
      </OutageProvider>
    );

    screen.getByTestId("set").click();
    
    await waitFor(() => {
      expect(screen.getByTestId("error-view")).toBeInTheDocument();
      expect(screen.getByTestId("messages").textContent).toBe("Error");
    });
  });
});
