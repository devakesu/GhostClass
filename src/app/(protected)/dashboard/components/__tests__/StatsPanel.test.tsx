/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsPanel } from "../StatsPanel";

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("framer-motion", () => {
  const mockComponent = (
    { children, ...rest }: { children?: ReactNode; [key: string]: unknown },
  ) => {
    return <div {...rest}>{children}</div>;
  };

  return {
    motion: {
      div: mockComponent,
    },
    m: {
      div: mockComponent,
    },
  };
});

describe("StatsPanel", () => {
  it("renders the loading footer without paragraph nesting", () => {
    const { container } = render(
      <StatsPanel
        stats={{
          rawOfficialPercentage: 72,
          rawPercentage: 78,
          finalPresent: 10,
          realPresent: 8,
          finalTotal: 12,
          realTotal: 10,
          officialPercentage: 72,
          percentage: 78,
        }}
        isLoadingAttendance
        targetPercentage={75}
      />,
    );

    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
    expect(container.querySelector("p")).toBeNull();
  });
});
