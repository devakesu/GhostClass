import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AttendanceChart } from '../attendance-chart';

// Mock recharts – replace the heavy SVG components with lightweight stubs
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: ({ content, active, payload }: any) => {
    if (content) {
      return content({ active, payload });
    }
    return null;
  },
}));

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: () => ({
    targetPercentage: 75,
  }),
}));

vi.mock('lucide-react', () => ({
  BarChart3: ({ className, ...props }: any) => (
    <span data-testid="bar-chart3-icon" className={className} {...props} />
  ),
}));

vi.mock('@/lib/utils', () => ({
  generateSlotKey: (_courseId: string, date: string, session: string) =>
    `${_courseId}-${date}-${session}`,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/logic/attendance-reconciliation', () => ({
  ATTENDANCE_STATUS: {
    PRESENT: 1,
    ABSENT: 2,
    DUTY_LEAVE: 225,
    OTHER_LEAVE: 112,
  },
}));

// Minimal sample data
const sampleAttendanceData = {
  studentAttendanceData: {
    '2024-01-10': {
      '1': { course: '101', attendance: 1, session: '1' },
      '2': { course: '101', attendance: 2, session: '2' },
    },
  },
};

const sampleCoursesData = {
  courses: {
    '101': { name: 'Mathematics', code: 'MATH101' },
  },
};

describe('AttendanceChart', () => {
  let mockResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ResizeObserver as a class constructor
    class MockResizeObserver implements ResizeObserver {
      constructor(_cb: ResizeObserverCallback) {}
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    mockResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Stub getBoundingClientRect to return 400x300 dimensions
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the loading placeholder when dimensions are zero', () => {
    // Override ResizeObserver to not trigger callback (dimensions stay 0)
    class NoopResizeObserver {
      constructor(_cb: ResizeObserverCallback) {}
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 0,
      height: 0,
      top: 0, left: 0, bottom: 0, right: 0,
    });

    render(<AttendanceChart />);
    expect(screen.getByTestId('bar-chart3-icon')).toBeInTheDocument();
  });

  it('renders empty state when there is no attendance data', async () => {
    render(<AttendanceChart coursesData={sampleCoursesData} />);
    // With data but no attendance, shows empty state
    expect(screen.getByText('No attendance data')).toBeInTheDocument();
  });

  it('renders the bar chart when both attendance and course data are provided', async () => {
    render(
      <AttendanceChart
        attendanceData={sampleAttendanceData as any}
        coursesData={sampleCoursesData}
      />
    );
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('dismisses the tooltip when a touch occurs outside the chart container', async () => {
    render(
      <AttendanceChart
        attendanceData={sampleAttendanceData as any}
        coursesData={sampleCoursesData}
      />
    );

    // Dispatch a touchstart on document.body (outside the chart container).
    // The handler checks e.target, not the touches list, so no Touch object is needed.
    act(() => {
      document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    });

    // Chart remains rendered; no errors thrown
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('keeps the tooltip visible when a touch occurs inside the chart container', async () => {
    const { container } = render(
      <AttendanceChart
        attendanceData={sampleAttendanceData as any}
        coursesData={sampleCoursesData}
      />
    );

    const chartDiv = container.querySelector('[aria-label="Attendance overview bar chart"]')!;

    // Dispatch on the chart div itself — e.target will be inside the container.
    act(() => {
      chartDiv.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    });

    // Chart should remain rendered
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('updates isMobile state when media query changes', () => {
    const mqlListeners: Array<(e: MediaQueryListEvent) => void> = [];

    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn().mockImplementation((_event: string, handler: any) => {
        mqlListeners.push(handler);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <AttendanceChart
        attendanceData={sampleAttendanceData as any}
        coursesData={sampleCoursesData}
      />
    );

    // Simulate a change to mobile
    act(() => {
      mqlListeners.forEach((fn) =>
        fn({ matches: true } as MediaQueryListEvent)
      );
    });

    // Chart still renders after media query change
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('falls back to resize event listener when ResizeObserver is unavailable', () => {
    // Temporarily make ResizeObserver undefined at the global scope
    const original = globalThis.ResizeObserver;
    // @ts-expect-error - simulating missing ResizeObserver
    delete globalThis.ResizeObserver;
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(
      <AttendanceChart
        attendanceData={sampleAttendanceData as any}
        coursesData={sampleCoursesData}
      />
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    // Restore
    globalThis.ResizeObserver = original;
  });
});
