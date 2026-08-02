/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationsPage from "../page";

vi.mock("../NotificationsClient", () => ({
  default: () => (
    <div data-testid="notifications-client">NotificationsClient</div>
  ),
}));

describe("NotificationsPage", () => {
  it("renders NotificationsClient", () => {
    render(<NotificationsPage />);
    expect(screen.getByTestId("notifications-client")).toBeInTheDocument();
  });
});
