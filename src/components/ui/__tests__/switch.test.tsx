import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "../switch";
import "@testing-library/jest-dom/vitest";

describe("Switch Component", () => {
  it("renders correctly", () => {
    render(<Switch />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toBeDefined();
  });

  it("applies custom className", () => {
    render(<Switch className="custom-class" />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement.className).toContain("custom-class");
  });

  it("handles checked state", () => {
    render(<Switch checked={true} onCheckedChange={() => {}} />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement.getAttribute("aria-checked")).toBe("true");
  });

  it("handles unchecked state", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement.getAttribute("aria-checked")).toBe("false");
  });

  it("calls onCheckedChange when clicked", () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} />);
    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("is disabled when disabled prop is passed", () => {
    render(<Switch disabled />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toBeDisabled();
  });

  it("has data-slot attributes", () => {
    render(<Switch />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement.getAttribute("data-slot")).toBe("switch");

    // The thumb is a child of the root
    const thumb = switchElement.querySelector('[data-slot="switch-thumb"]');
    expect(thumb).toBeDefined();
  });
});
