import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";

describe("Avatar UI Component", () => {
  it("renders avatar parts correctly", () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/image.png" alt="Test User" />
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    );

    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="avatar-fallback"]'))
      .toBeInTheDocument();
  });

  it("renders fallback when image is missing", () => {
    render(
      <Avatar>
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText("TU")).toBeInTheDocument();
  });
});
