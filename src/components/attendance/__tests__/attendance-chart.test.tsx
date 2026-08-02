import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import React from "react";
import { AttendanceChart } from "../attendance-chart";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/providers/attendance-settings", () => ({
  useAttendanceSettings: () => ({ targetPercentage: 75 }),
}));

vi.mock("@/lib/utils", () => ({
  generateSlotKey: (courseId: string, date: string, session: string) =>
    `${courseId}-${date}-${session}`,
  normalizeCourseCode: (code: string | undefined | null) =>
    String(code ?? "").toUpperCase().replace(/[\s\u00A0-]/g, ""),
}));

vi.mock("lucide-react", () => ({
  BarChart3: ({ className, ...props }: React.HTMLAttributes<SVGElement>) =>
    React.createElement("svg", {
      "data-testid": "bar-chart3-icon",
      className,
      ...props,
    }),
}));

vi.mock("@/lib/logic/attendance-reconciliation", () => ({
  ATTENDANCE_STATUS: {
    PRESENT: 110,
    ABSENT: 111,
    DUTY_LEAVE: 225,
    OTHER_LEAVE: 112,
  },
}));

// Capture the Tooltip content prop so tests can invoke it directly.
type TooltipPayload = { payload: Record<string, unknown> };
type TooltipContentFn = (
  props: { active?: boolean; payload?: TooltipPayload[] },
) => React.ReactNode;
let capturedTooltipContent: TooltipContentFn | null = null;

// Mock recharts so it renders minimal DOM without canvas/SVG complexities
vi.mock("recharts", async () => {
  const React = await import("react");
  const MockBarChart = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "bar-chart" }, children);
  const noop = () => null;
  const MockTooltip = ({ content }: { content?: TooltipContentFn }) => {
    capturedTooltipContent = content ?? null;
    return null;
  };
  const MockReferenceLine = (
    { label }: {
      label?: (
        props: { viewBox: { width: number; x: number; y: number } },
      ) => React.ReactNode;
    },
  ) => {
    if (typeof label === "function") {
      return React.createElement("div", {
        "data-testid": "reference-line-label",
      }, label({ viewBox: { width: 100, x: 0, y: 0 } }));
    }
    return null;
  };
  const MockYAxis = (
    { tickFormatter }: { tickFormatter?: (v: number) => void },
  ) => {
    if (tickFormatter) tickFormatter(50);
    return null;
  };
  return {
    BarChart: MockBarChart,
    Bar: noop,
    CartesianGrid: noop,
    ReferenceLine: MockReferenceLine,
    XAxis: noop,
    YAxis: MockYAxis,
    Tooltip: MockTooltip,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatchMedia(isMobileMatch: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 640px)" ? isMobileMatch : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const sampleCourses = {
  courses: {
    "1": { code: "CS101", name: "Computer Science" },
  },
};

const sampleAttendanceData = {
  studentAttendanceData: {
    "2024-01-01": {
      "1": { course: "1", attendance: 110, session: "1" }, // PRESENT
      "2": { course: "1", attendance: 111, session: "2" }, // ABSENT
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AttendanceChart", () => {
  let originalResizeObserver: typeof ResizeObserver;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    capturedTooltipContent = null;
    originalResizeObserver = global.ResizeObserver;
    // Provide a minimal ResizeObserver stub
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
    addEventListenerSpy = vi.spyOn(document, "addEventListener");
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it("renders the loading spinner when dimensions are not yet available", () => {
    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );
    // Dimensions start at 0×0 → loading spinner (pulsing BarChart3 icon)
    expect(screen.getByTestId("bar-chart3-icon")).toBeInTheDocument();
  });

  it('renders "No attendance data" empty state when dimensions are set but data is empty', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    };

    render(
      React.createElement(AttendanceChart, {
        attendanceData: {
          studentAttendanceData: {},
        } as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["attendanceData"],
        trackingData: [],
        coursesData: { courses: {} },
      }),
    );

    // Mock getBoundingClientRect on the container so it returns non-zero dimensions
    const containerEl = screen.getByRole("img");
    vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Trigger the ResizeObserver callback so dimensions are updated
    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByText("No attendance data")).toBeInTheDocument();
  });

  it("renders the BarChart when dimensions are set and data is available", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    };

    render(
      React.createElement(AttendanceChart, {
        attendanceData: sampleAttendanceData as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["attendanceData"],
        trackingData: [],
        coursesData: sampleCourses as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["coursesData"],
      }),
    );

    // Mock getBoundingClientRect on the container so it returns non-zero dimensions
    const containerEl = screen.getByRole("img");
    vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Trigger the ResizeObserver callback so dimensions are updated
    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("registers document touchstart listener when isMobile is true", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(true),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );

    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "touchstart",
    );
    expect(touchCalls.length).toBeGreaterThan(0);

    // Restore default matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it("does not register document touchstart listener when isMobile is false", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(false),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );

    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "touchstart",
    );
    expect(touchCalls.length).toBe(0);
  });

  it("removes touchstart listener when component unmounts", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(true),
    });

    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );

    unmount();

    const touchRemoveCalls = removeEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "touchstart",
    );
    expect(touchRemoveCalls.length).toBeGreaterThan(0);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it("updates isMobile when media query changes", async () => {
    let mqlHandler: ((e: Partial<MediaQueryListEvent>) => void) | null = null;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn().mockImplementation(
          (
            _event: string,
            handler: (e: Partial<MediaQueryListEvent>) => void,
          ) => {
            if (query === "(max-width: 640px)") mqlHandler = handler;
          },
        ),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );

    // Simulate the media query changing to mobile
    await act(async () => {
      if (mqlHandler) {
        mqlHandler({ matches: true } as Partial<MediaQueryListEvent>);
      }
    });

    // After switching to mobile, touch handler should now be registered
    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "touchstart",
    );
    expect(touchCalls.length).toBeGreaterThan(0);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it("handleDocumentTouch hides tooltip when touch is outside chart, shows when inside", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(true),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      }),
    );

    // Capture the registered touchstart handler
    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "touchstart",
    );
    expect(touchCalls.length).toBeGreaterThan(0);
    const handler = touchCalls[0][1] as (e: Partial<TouchEvent>) => void;

    const container = screen.getByRole("img");
    // Spy on contains: simulate touch inside the chart container
    vi.spyOn(container, "contains").mockReturnValueOnce(true);
    await act(async () => {
      handler({ target: container } as unknown as Partial<TouchEvent>);
    });

    // Simulate touch outside the chart
    vi.spyOn(container, "contains").mockReturnValueOnce(false);
    await act(async () => {
      handler({ target: document.body } as unknown as Partial<TouchEvent>);
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it("processes tracking data entries (extra and correction types)", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    };

    const trackingData = [
      // extra present entry
      {
        course: "1",
        date: "2024-01-02",
        session: "1",
        attendance: 110,
        status: "extra",
      },
      // correction: official absent → tracking present
      {
        course: "1",
        date: "2024-01-01",
        session: "1",
        attendance: 110,
        status: "correction",
      },
      // correction: official present → tracking absent
      {
        course: "1",
        date: "2024-01-01",
        session: "2",
        attendance: 111,
        status: "correction",
      },
    ];

    render(
      React.createElement(AttendanceChart, {
        attendanceData: sampleAttendanceData as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["attendanceData"],
        trackingData: trackingData as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["trackingData"],
        coursesData: sampleCourses as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["coursesData"],
      }),
    );

    const containerEl = screen.getByRole("img");
    vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  describe("Tooltip color logic", () => {
    // Helper: render the chart with valid dimensions so the BarChart (and
    // thus MockTooltip) mounts and capturedTooltipContent gets populated.
    async function renderChartWithDimensions() {
      let resizeCallback: ResizeObserverCallback | null = null;
      global.ResizeObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        constructor(cb: ResizeObserverCallback) {
          resizeCallback = cb;
        }
      };

      render(
        React.createElement(AttendanceChart, {
          attendanceData:
            sampleAttendanceData as unknown as React.ComponentProps<
              typeof AttendanceChart
            >["attendanceData"],
          trackingData: [],
          coursesData: sampleCourses as unknown as React.ComponentProps<
            typeof AttendanceChart
          >["coursesData"],
        }),
      );

      const containerEl = screen.getByRole("img");
      vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      await act(async () => {
        if (resizeCallback) resizeCallback([], {} as ResizeObserver);
      });
    }

    it("colors Adjusted (Loss) row red when isLoss is true", async () => {
      await renderChartWithDimensions();
      expect(capturedTooltipContent).not.toBeNull();

      // officialPercentage=90, totalPercentage=85 — both above the 75% target.
      // The old code coloured this green (85 >= 75); the fix must colour it red (isLoss=true).
      const lossPayload = {
        fullName: "Computer Science",
        officialPercentage: 90,
        present: 9,
        total: 10,
        displayedExtra: 1,
        isLoss: true,
        totalPercentage: 85,
        mergedPresent: 8,
        mergedTotal: 10,
      };

      const { getByText } = render(
        capturedTooltipContent!({
          active: true,
          payload: [{ payload: lossPayload }],
        }) as React.ReactElement,
      );

      const adjustedLabel = getByText((_content, element) => {
        return element?.textContent === "Adjusted (Loss):";
      });
      const adjustedRow = adjustedLabel.closest("div")!;
      const valueSpan = adjustedRow.querySelector("span.font-mono");
      expect(valueSpan).toHaveClass("text-red-600");
      expect(valueSpan).not.toHaveClass("text-green-600");
    });

    it("colors Adjusted (Gain) row green when isLoss is false", async () => {
      await renderChartWithDimensions();
      expect(capturedTooltipContent).not.toBeNull();

      const gainPayload = {
        fullName: "Computer Science",
        officialPercentage: 80,
        present: 8,
        total: 10,
        displayedExtra: 1,
        isLoss: false,
        totalPercentage: 90,
        mergedPresent: 9,
        mergedTotal: 10,
      };

      const { getByText } = render(
        capturedTooltipContent!({
          active: true,
          payload: [{ payload: gainPayload }],
        }) as React.ReactElement,
      );

      const adjustedLabel = getByText((_content, element) => {
        return element?.textContent === "Adjusted (Gain):";
      });
      const adjustedRow = adjustedLabel.closest("div")!;
      const valueSpan = adjustedRow.querySelector("span.font-mono");
      expect(valueSpan).toHaveClass("text-green-600");
      expect(valueSpan).not.toHaveClass("text-red-600");
    });
    it("returns null when tooltip is inactive or has no payload", async () => {
      await renderChartWithDimensions();
      expect(capturedTooltipContent).not.toBeNull();

      const content = capturedTooltipContent!({ active: false });
      expect(content).toBeNull();
    });
  });

  it("renders reference line label", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    };

    render(
      React.createElement(AttendanceChart, {
        attendanceData: sampleAttendanceData as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["attendanceData"],
        trackingData: [],
        coursesData: sampleCourses as unknown as React.ComponentProps<
          typeof AttendanceChart
        >["coursesData"],
      }),
    );

    const containerEl = screen.getByRole("img");
    vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByTestId("reference-line-label")).toBeInTheDocument();
  });
});
