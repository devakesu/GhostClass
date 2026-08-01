import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "../progress";

describe("Progress Component", () => {
  it("renders correctly with a value", () => {
    render(<Progress value={50} data-testid="progress" />);
    const progress = screen.getByTestId("progress");
    expect(progress).toBeDefined();

    const indicator = progress.querySelector(
      '[data-slot="progress-indicator"]',
    );
    expect(indicator).toBeDefined();
    expect((indicator as HTMLElement).style.transform).toBe("translateX(-50%)");
  });

  it("renders correctly with 0 value", () => {
    render(<Progress value={0} data-testid="progress" />);
    const progress = screen.getByTestId("progress");
    const indicator = progress.querySelector(
      '[data-slot="progress-indicator"]',
    );
    expect((indicator as HTMLElement).style.transform).toBe(
      "translateX(-100%)",
    );
  });

  it("applies custom className", () => {
    render(
      <Progress value={50} className="custom-class" data-testid="progress" />,
    );
    const progress = screen.getByTestId("progress");
    expect(progress.className).toContain("custom-class");
  });
});
