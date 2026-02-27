import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { AttendanceChart } from '../attendance-chart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/providers/attendance-settings', () => ({
  useAttendanceSettings: () => ({ targetPercentage: 75 }),
}));

vi.mock('@/lib/utils', () => ({
  generateSlotKey: (courseId: string, date: string, session: string) =>
    `${courseId}-${date}-${session}`,
}));

vi.mock('lucide-react', () => ({
  BarChart3: ({ className, ...props }: React.HTMLAttributes<SVGElement>) =>
    React.createElement('svg', { 'data-testid': 'bar-chart3-icon', className, ...props }),
}));

vi.mock('@/lib/logic/attendance-reconciliation', () => ({
  ATTENDANCE_STATUS: {
    PRESENT: 110,
    ABSENT: 111,
    DUTY_LEAVE: 225,
    OTHER_LEAVE: 112,
  },
}));

// Mock recharts so it renders minimal DOM without canvas/SVG complexities
vi.mock('recharts', () => {
  const MockBarChart = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children);
  const noop = () => null;
  return {
    BarChart: MockBarChart,
    Bar: noop,
    CartesianGrid: noop,
    ReferenceLine: noop,
    XAxis: noop,
    YAxis: noop,
    Tooltip: noop,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatchMedia(isMobileMatch: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(max-width: 640px)' ? isMobileMatch : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const sampleCourses = {
  courses: {
    '1': { code: 'CS101', name: 'Computer Science' },
  },
};

const sampleAttendanceData = {
  studentAttendanceData: {
    '2024-01-01': {
      '1': { course: '1', attendance: 110, session: '1' }, // PRESENT
      '2': { course: '1', attendance: 111, session: '2' }, // ABSENT
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttendanceChart', () => {
  let originalResizeObserver: typeof ResizeObserver;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalResizeObserver = global.ResizeObserver;
    // Provide a minimal ResizeObserver stub
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it('renders the loading spinner when dimensions are not yet available', () => {
    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      })
    );
    // Dimensions start at 0×0 → loading spinner (pulsing BarChart3 icon)
    expect(screen.getByTestId('bar-chart3-icon')).toBeInTheDocument();
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
        attendanceData: { studentAttendanceData: {} } as any,
        trackingData: [],
        coursesData: { courses: {} },
      })
    );

    // Mock getBoundingClientRect on the container so it returns non-zero dimensions
    const containerEl = screen.getByRole('img');
    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 300, top: 0, left: 0, bottom: 300, right: 400, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Trigger the ResizeObserver callback so dimensions are updated
    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByText('No attendance data')).toBeInTheDocument();
  });

  it('renders the BarChart when dimensions are set and data is available', async () => {
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
        attendanceData: sampleAttendanceData as any,
        trackingData: [],
        coursesData: sampleCourses as any,
      })
    );

    // Mock getBoundingClientRect on the container so it returns non-zero dimensions
    const containerEl = screen.getByRole('img');
    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 300, top: 0, left: 0, bottom: 300, right: 400, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Trigger the ResizeObserver callback so dimensions are updated
    await act(async () => {
      if (resizeCallback) resizeCallback([], {} as ResizeObserver);
    });

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('registers document touchstart listener when isMobile is true', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(true),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      })
    );

    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'touchstart'
    );
    expect(touchCalls.length).toBeGreaterThan(0);

    // Restore default matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it('does not register document touchstart listener when isMobile is false', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(false),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      })
    );

    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'touchstart'
    );
    expect(touchCalls.length).toBe(0);
  });

  it('removes touchstart listener when component unmounts', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(true),
    });

    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      })
    );

    unmount();

    const touchRemoveCalls = removeEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'touchstart'
    );
    expect(touchRemoveCalls.length).toBeGreaterThan(0);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(false),
    });
  });

  it('updates isMobile when media query changes', async () => {
    let mqlHandler: ((e: Partial<MediaQueryListEvent>) => void) | null = null;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn().mockImplementation((_event: string, handler: (e: Partial<MediaQueryListEvent>) => void) => {
          if (query === '(max-width: 640px)') mqlHandler = handler;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      React.createElement(AttendanceChart, {
        attendanceData: undefined,
        trackingData: undefined,
        coursesData: undefined,
      })
    );

    // Simulate the media query changing to mobile
    await act(async () => {
      if (mqlHandler) mqlHandler({ matches: true } as Partial<MediaQueryListEvent>);
    });

    // After switching to mobile, touch handler should now be registered
    const touchCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'touchstart'
    );
    expect(touchCalls.length).toBeGreaterThan(0);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: makeMatchMedia(false),
    });
  });
});
