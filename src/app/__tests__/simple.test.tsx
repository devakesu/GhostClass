import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BuildInfoPage from "../(public)/build-info/page";

describe("Simple Test with BuildInfoPage", () => {
  it("should render BuildInfoPage", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    render(<BuildInfoPage />);
    expect(screen.getByText("Build Information")).toBeInTheDocument();
  });
});
