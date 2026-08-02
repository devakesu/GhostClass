import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AttendanceSettingsProvider,
  useAttendanceSettings,
} from "../attendance-settings";

// Mock user settings
vi.mock("@/providers/user-settings", () => ({
  useUserSettings: vi.fn(() => ({
    settings: { target_percentage: 80 },
    updateTarget: vi.fn(),
    isLoading: false,
  })),
}));

function TestComponent() {
  const { targetPercentage } = useAttendanceSettings();
  return <div data-testid="target">{targetPercentage}</div>;
}

describe("AttendanceSettingsProvider", () => {
  it("provides settings correctly", () => {
    render(
      <AttendanceSettingsProvider>
        <TestComponent />
      </AttendanceSettingsProvider>,
    );
    expect(screen.getByTestId("target").textContent).toBe("80");
  });

  it("falls back to default percentage of 75", async () => {
    const { useUserSettings } = await import("@/providers/user-settings");
    vi.mocked(useUserSettings).mockReturnValueOnce({
      settings: null,
      updateTarget: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof useUserSettings>);

    render(
      <AttendanceSettingsProvider>
        <TestComponent />
      </AttendanceSettingsProvider>,
    );
    expect(screen.getByTestId("target").textContent).toBe("75");
  });

  it("throws error when used outside provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(
      "useAttendanceSettings must be used within an AttendanceSettingsProvider",
    );
    consoleSpy.mockRestore();
  });
});
