import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "../page";

type FooterProps = {
  className?: string;
};

vi.mock("@/components/layout/footer", () => ({
  Footer: ({ className }: FooterProps) => (
    <footer className={className}>Footer</footer>
  ),
}));

vi.mock("@/components/user/login-form-client", () => ({
  LoginFormClient: () => <div data-testid="login-form">LoginFormClient</div>,
}));

describe("LoginPage", () => {
  it("renders login form and footer", async () => {
    // LoginPage is async
    const Page = await LoginPage();
    render(Page);

    expect(screen.getByTestId("login-form")).toBeDefined();
    expect(screen.getByText("Footer")).toBeDefined();
  });
});
