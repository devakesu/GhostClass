import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calendar } from "../calendar";

describe("Calendar Component", () => {
  it("renders correctly", () => {
    // We need to provide a mode to DayPicker if we use it in the component
    render(<Calendar mode="single" selected={new Date(2024, 0, 1)} />);

    // Check if some days are rendered
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
  });

  it("renders navigation buttons", () => {
    render(<Calendar mode="single" />);

    expect(screen.getByLabelText(/previous month/i)).toBeDefined();
    expect(screen.getByLabelText(/next month/i)).toBeDefined();
  });
});
