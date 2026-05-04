import { describe, it, vi, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackingClient from '../TrackingClient';

// Mock all required hooks minimally
vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
}));
vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: vi.fn(() => ({ data: 0, isLoading: false, refetch: vi.fn() })),
}));
vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({ data: { id: '123' }, isLoading: false })),
}));
vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({ data: { id: '123' }, isLoading: false }),
}));
vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: 'even', isLoading: false }),
  useFetchAcademicYear: () => ({ data: '2024-25', isLoading: false }),
}));
vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    disabledCoursesMap: {},
    disabledCodes: new Set(),
    isDisabled: vi.fn(() => false),
    getDisableReason: vi.fn(() => null),
    isLoading: false,
  })),
}));
vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({ isSyncing: false, syncCompleted: true })),
}));





import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('Simple TrackingClient Test', () => {
  const queryClient = new QueryClient();
  it('renders without hanging', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrackingClient />
      </QueryClientProvider>
    );
    expect(await screen.findByRole('heading', { name: /No Tracking History/i })).toBeInTheDocument();
  });

});

