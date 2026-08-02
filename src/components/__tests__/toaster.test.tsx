import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Capture props passed to the underlying Sonner Toaster so we can assert them
// ---------------------------------------------------------------------------
const { capturedProps, mockUseTheme } = vi.hoisted(() => ({
  capturedProps: { current: null as any },
  mockUseTheme: vi.fn(() => ({
    theme: "dark" as "dark" | "light",
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  })),
}));

vi.mock("sonner", () => ({
  // Capture every set of props the Toaster is rendered with
  Toaster: (props: any) => {
    capturedProps.current = props;
    return null;
  },
}));

vi.mock("@/providers/theme", () => ({
  useTheme: () => mockUseTheme(),
}));

// Import after mocks are set up
import { Toaster } from "../toaster";

describe("Toaster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps.current = null;
    mockUseTheme.mockReturnValue({
      theme: "dark" as "dark" | "light",
      toggleTheme: vi.fn(),
      setTheme: vi.fn(),
    });
  });

  it("renders with invert=true and richColors", () => {
    render(<Toaster />);
    expect(capturedProps.current).toMatchObject({
      invert: true,
      richColors: true,
    });
  });

  it("passes the current dark theme from useTheme to SonnerToaster", () => {
    render(<Toaster />);
    expect(capturedProps.current).toMatchObject({ theme: "dark" });
  });

  it("passes the current light theme from useTheme to SonnerToaster", () => {
    mockUseTheme.mockReturnValue({
      theme: "light" as "dark" | "light",
      toggleTheme: vi.fn(),
      setTheme: vi.fn(),
    });
    render(<Toaster />);
    expect(capturedProps.current).toMatchObject({ theme: "light" });
  });

  it("renders with bottom-right position", () => {
    render(<Toaster />);
    expect(capturedProps.current).toMatchObject({ position: "bottom-right" });
  });
});
