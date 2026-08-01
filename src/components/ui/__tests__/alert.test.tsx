import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, AlertDescription, AlertTitle } from "../alert";

describe("Alert Component", () => {
  it("renders correctly with default variant", () => {
    render(
      <Alert>
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
          You can add components to your app using the cli.
        </AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.className).toContain("bg-card");
    expect(screen.getByText("Heads up!")).toBeDefined();
    expect(
      screen.getByText("You can add components to your app using the cli."),
    ).toBeDefined();
  });

  it("renders correctly with destructive variant", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Your session has expired.</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("text-destructive");
    expect(screen.getByText("Error")).toBeDefined();
  });

  it("applies custom className", () => {
    render(
      <Alert className="custom-class">
        <AlertTitle>Custom</AlertTitle>
      </Alert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("custom-class");
  });
});
