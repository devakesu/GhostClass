import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Textarea } from "../textarea";

describe("Textarea Component", () => {
  it("renders correctly", () => {
    render(<Textarea placeholder="Type here" />);
    const textarea = screen.getByPlaceholderText("Type here");
    expect(textarea).toBeDefined();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("handles value changes", () => {
    const onChange = vi.fn();
    render(<Textarea onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("applies custom className", () => {
    render(<Textarea className="custom-class" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea.className).toContain("custom-class");
  });

  it("can be disabled", () => {
    render(<Textarea disabled />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDisabled();
  });
});
