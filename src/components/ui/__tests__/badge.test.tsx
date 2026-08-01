/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../badge";

describe("Badge Component", () => {
  it("renders correctly", () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText("Test Badge")).toBeDefined();
  });

  it("applies variant classes", () => {
    const { container } = render(
      <Badge variant="destructive">Destructive</Badge>,
    );
    expect(container.firstChild).toHaveClass("bg-destructive");
  });
});
