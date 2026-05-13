import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OutageProvider, useOutage } from "../outage-provider";

// Mock ServiceErrorView to avoid Radix/Framer issues in tests
vi.mock("@/components/service-error-view", () => ({
  ServiceErrorView: ({ messages, error }: { messages: string[]; error?: string }) => (
    <div data-testid="error-view">
      <div data-testid="messages">{messages.join(", ")}</div>
      {error && <div data-testid="details">{error}</div>}
    </div>
  ),
}));

function TestComponent() {
  const { hasOutage, setOutage, resetOutage } = useOutage();
  return (
    <div>
      <span data-testid="has-outage">{String(hasOutage)}</span>
      <button data-testid="set-true" onClick={() => setOutage(["Server down"], "503")}>Set True</button>
      <button data-testid="reset" onClick={() => resetOutage()}>Reset</button>
    </div>
  );
}

describe("OutageProvider", () => {
  it("provides default value when used outside provider", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("has-outage").textContent).toBe("false");
  });

  it("manages outage state correctly via hook", () => {
    render(
      <OutageProvider>
        <TestComponent />
      </OutageProvider>
    );

    expect(screen.getByTestId("has-outage").textContent).toBe("false");
    expect(screen.queryByTestId("error-view")).not.toBeInTheDocument();

    act(() => {
      screen.getByTestId("set-true").click();
    });
    
    // TestComponent is unmounted when hasOutage is true
    expect(screen.queryByTestId("has-outage")).not.toBeInTheDocument();
    expect(screen.getByTestId("error-view")).toBeInTheDocument();
    expect(screen.getByTestId("messages").textContent).toBe("Server down");
    expect(screen.getByTestId("details").textContent).toBe("503");
  });

  it("responds to global 'gc:outage' custom events", () => {
    render(
      <OutageProvider>
        <TestComponent />
      </OutageProvider>
    );

    expect(screen.queryByTestId("error-view")).not.toBeInTheDocument();

    act(() => {
      const event = new CustomEvent("gc:outage", {
        detail: { messages: ["External outage"], details: "Error 503" }
      });
      window.dispatchEvent(event);
    });

    expect(screen.getByTestId("error-view")).toBeInTheDocument();
    expect(screen.getByTestId("messages").textContent).toBe("External outage");
    expect(screen.getByTestId("details").textContent).toBe("Error 503");
  });
});
