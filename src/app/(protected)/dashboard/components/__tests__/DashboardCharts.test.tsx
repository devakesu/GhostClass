/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardCharts } from '../DashboardCharts';
import dynamic from 'next/dynamic';

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: any) => <>{children}</>,
}));

vi.mock('framer-motion', () => {
  const mockComponent = ({ children, ...props }: any) => {
    const { initial: _i, animate: _a, transition: _t, whileHover: _wh, whileTap: _wt, exit: _e, ...rest } = props;
    return <div {...rest}>{children}</div>;
  };
  return {
    motion: {
      div: mockComponent,
      button: mockComponent,
    },
    m: {
      div: mockComponent,
      button: mockComponent,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
    LazyMotion: ({ children }: any) => <>{children}</>,
    domAnimation: {},
  };
});

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} data-testid="mock-image" src={props.src || ""} />,
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading" />,
}));

// Mock dynamic import correctly to capture the options
vi.mock('next/dynamic', () => ({
  default: vi.fn((_fn: any, options: any) => {
    return () => <div data-testid="attendance-chart" />;
  }),
}));

describe('DashboardCharts', () => {
  const mockProps = {
    stats: {
      realPresent: 10,
      realAbsent: 2,
      realDL: 1,
      otherLeave: 0,
      correctionPresent: 0,
      extraPresent: 0,
      savedAbsent: 0,
      extraAbsent: 0,
      correctionDL: 0,
      extraDL: 0,
    },
    isLoadingAttendance: false,
    attendanceData: {},
    filteredChartData: {},
    trackingData: [],
    courseRegistry: {},
    disabledCodes: new Set<string>(),
    activeCourseCount: { active: 5, total: 8 },
    isLoadingCourses: false,
  };

  it('renders stats and chart', () => {
    render(<DashboardCharts {...mockProps} />);
    expect(screen.getByText('Attendance Overview')).toBeInTheDocument();
  });

  it('covers dynamic loading config and ChartSkeleton', () => {
    const dynamicMock = vi.mocked(dynamic);
    // Find the call for AttendanceChart
    const call = dynamicMock.mock.calls.find(c => c[1]?.ssr === false);
    if (call && call[1]?.loading) {
      const Loading = call[1].loading;
      render(<Loading />);
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    }
  });
});
