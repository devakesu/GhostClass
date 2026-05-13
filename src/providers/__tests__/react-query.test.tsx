import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import ReactQueryProvider from "../react-query";

// Mock children providers to avoid heavy initialization
vi.mock("../user-settings", () => ({
  UserSettingsProvider: ({ children }: { children: ReactNode }) => <div data-testid="user-settings">{children}</div>,
}));

vi.mock("../attendance-settings", () => ({
  AttendanceSettingsProvider: ({ children }: { children: ReactNode }) => <div data-testid="attendance-settings">{children}</div>,
}));

describe("ReactQueryProvider", () => {
  it("renders children wrapped in providers", () => {
    render(
      <ReactQueryProvider>
        <div data-testid="child">Child Content</div>
      </ReactQueryProvider>
    );

    expect(screen.getByTestId("user-settings")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-settings")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
