import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OutageProvider, useOutage } from "../outage-provider";

function TestComponent() {
  const { hasOutage, setOutage, resetOutage } = useOutage();
  return (
    <div>
      <span data-testid="has-outage">{String(hasOutage)}</span>
      <button data-testid="set-true" onClick={() => setOutage(true)}>Set True</button>
      <button data-testid="reset" onClick={() => resetOutage()}>Reset</button>
    </div>
  );
}

describe("OutageProvider", () => {
  it("provides default value when used outside provider", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("has-outage").textContent).toBe("false");
    
    // Fallback setOutage/resetOutage should be callable without error
    act(() => {
      screen.getByTestId("set-true").click();
      screen.getByTestId("reset").click();
    });
  });

  it("manages outage state correctly", () => {
    render(
      <OutageProvider>
        <TestComponent />
      </OutageProvider>
    );

    expect(screen.getByTestId("has-outage").textContent).toBe("false");

    act(() => {
      screen.getByTestId("set-true").click();
    });
    expect(screen.getByTestId("has-outage").textContent).toBe("true");

    act(() => {
      screen.getByTestId("reset").click();
    });
    expect(screen.getByTestId("has-outage").textContent).toBe("false");
  });
});
