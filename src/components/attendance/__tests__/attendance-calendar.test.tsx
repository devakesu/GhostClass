import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- Hoisted Mocks ---
const { 
  mockUseUser, 
  mockUseProfile, 
  mockUseTrackingData, 
  mockUseTrackingCount 
} = vi.hoisted(() => ({
  mockUseUser: vi.fn(() => ({ data: { id: '123' }, isLoading: false })),
  mockUseProfile: vi.fn(() => ({ data: { id: '123', username: 'test' }, isLoading: false })),
  mockUseTrackingData: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
  mockUseTrackingCount: vi.fn(() => ({ data: 0, isLoading: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/users/user', () => ({ useUser: mockUseUser }));
vi.mock('@/hooks/users/profile', () => ({ useProfile: mockUseProfile }));
vi.mock('@/hooks/tracker/useTrackingData', () => ({ useTrackingData: mockUseTrackingData }));
vi.mock('@/hooks/tracker/useTrackingCount', () => ({ useTrackingCount: mockUseTrackingCount }));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({ data: 'even', isLoading: false }),
  useFetchAcademicYear: () => ({ data: '2024', isLoading: false }),
}));
vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: () => ({ isDisabled: () => false }),
}));

const mockEq = () => ({ delete: vi.fn() });
const mockMatch = () => ({ eq: mockEq });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ 
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: () => ({ match: mockMatch, insert: vi.fn() })
  }),
}));

import { AttendanceCalendar } from '../attendance-calendar';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

describe('AttendanceCalendar', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
    
    mockUseTrackingData.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as ReturnType<typeof mockUseTrackingData>);
    
    mockUseTrackingCount.mockReturnValue({
      data: 0,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: 0 }),
    } as unknown as ReturnType<typeof mockUseTrackingCount>);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders correctly', async () => {
    renderWithProviders(<AttendanceCalendar attendanceData={undefined} semester="even" year="2025-26" />);
    expect(await screen.findByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('renders custom DL remarks for an extra event', async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    mockUseTrackingData.mockReturnValue({
      data: [
        {
          course: '42',
          session: 'I',
          date: todayStr,
          attendance: 225,
          status: 'extra',
          semester: 'even',
          year: '2025-26',
          remarks: 'NSS Camp 2026',
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof mockUseTrackingData>);

    renderWithProviders(<AttendanceCalendar attendanceData={undefined} semester="even" year="2025-26" />);
    expect(await screen.findByText('NSS Camp 2026')).toBeInTheDocument();
  });
});
