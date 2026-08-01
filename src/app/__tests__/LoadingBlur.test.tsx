import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LoadingBlur } from "../LoadingBlur";
import { useBuildInfo } from "@/hooks/use-build-info";

vi.mock("@/hooks/use-build-info", () => ({
  useBuildInfo: vi.fn(),
}));

describe("LoadingBlur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("renders children and hides loading overlay by default", () => {
    vi.mocked(useBuildInfo).mockReturnValue(
      { buildInfo: { is_legacy: false } } as any,
    );
    render(
      <LoadingBlur isLoading={false}>
        <div data-testid="child">Child Content</div>
      </LoadingBlur>,
    );

    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.queryByText("Loading")).toBeNull();
  });

  it("shows loading overlay after a short delay when isLoading is true", () => {
    vi.mocked(useBuildInfo).mockReturnValue(
      { buildInfo: { is_legacy: false } } as any,
    );
    render(
      <LoadingBlur isLoading={true}>
        <div>Child Content</div>
      </LoadingBlur>,
    );

    act(() => {
      vi.advanceTimersByTime(51);
    });

    expect(screen.getByText("Loading")).toBeDefined();
  });

  it("uses legacy styles when buildInfo indicates legacy", () => {
    vi.mocked(useBuildInfo).mockReturnValue(
      { buildInfo: { is_legacy: true } } as any,
    );
    const { container } = render(
      <LoadingBlur isLoading={true}>
        <div>Child Content</div>
      </LoadingBlur>,
    );

    act(() => {
      vi.advanceTimersByTime(51);
    });

    const overlay = container.querySelector(".bg-background\\/40");
    expect(overlay).toBeDefined();
  });
});
