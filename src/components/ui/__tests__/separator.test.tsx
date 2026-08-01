import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Separator } from "../separator";

describe("Separator Component", () => {
  it("renders correctly with default orientation", () => {
    render(<Separator data-testid="separator" />);
    const separator = screen.getByTestId("separator");
    expect(separator).toBeDefined();
    expect(separator.getAttribute("data-orientation")).toBe("horizontal");
  });

  it("renders correctly with vertical orientation", () => {
    render(<Separator data-testid="separator" orientation="vertical" />);
    const separator = screen.getByTestId("separator");
    expect(separator.getAttribute("data-orientation")).toBe("vertical");
  });

  it("applies custom className", () => {
    render(<Separator data-testid="separator" className="custom-class" />);
    const separator = screen.getByTestId("separator");
    expect(separator.className).toContain("custom-class");
  });
});
