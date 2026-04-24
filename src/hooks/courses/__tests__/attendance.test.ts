/**
 * Tests for useAttendanceReport and useCourseDetails hooks.
 *
 * Focus areas:
 * - useAttendanceReport: queryFn is called with the right endpoint; error when
 *   no response is returned
 * - useCourseDetails: normalises EzyGo API typos (totel → total,
 *   persantage → percentage); throws when courseId is empty
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

const axiosMock = {
  post: vi.fn(),
  get: vi.fn(),
};

vi.mock('@/lib/axios', () => ({
  default: axiosMock,
}));

vi.mock('@/lib/query-utils', () => ({
  retryOnce: () => false,
  retryTwice: () => false,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, client };
}

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { useAttendanceReport, useCourseDetails } from '../attendance';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAttendanceReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data from axios.post', async () => {
    const mockData = { studentAttendanceData: {}, courses: {} };
    axiosMock.post.mockResolvedValueOnce({ data: mockData });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAttendanceReport({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(axiosMock.post).toHaveBeenCalledWith('/attendancereports/student/detailed');
  });

  it('throws when axios.post returns falsy', async () => {
    axiosMock.post.mockResolvedValueOnce(null);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAttendanceReport({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when enabled option is false', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAttendanceReport({ enabled: false }), { wrapper });

    // Query should not have been called
    expect(result.current.fetchStatus).toBe('idle');
    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});

describe('useCourseDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalised data (totel → total, persantage → percentage)', async () => {
    const rawData = {
      present: 15,
      absent: 5,
      totel: 20,
      persantage: 75,
    };
    axiosMock.get.mockResolvedValueOnce({ data: rawData });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCourseDetails('999'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(20);
    expect(result.current.data?.percentage).toBe(75);
    // Misspelled fields should not appear on the normalised object
    expect((result.current.data as any)?.totel).toBeUndefined();
    expect((result.current.data as any)?.persantage).toBeUndefined();
  });

  it('prefers existing total/percentage fields over typo fields', async () => {
    const rawData = {
      present: 10,
      absent: 5,
      total: 15,
      percentage: 66,
      totel: 99,
      persantage: 99,
    };
    axiosMock.get.mockResolvedValueOnce({ data: rawData });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCourseDetails('888'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(15);
    expect(result.current.data?.percentage).toBe(66);
  });

  it('throws when courseId is empty string', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCourseDetails(''), { wrapper });

    // Hook with empty courseId is disabled
    expect(result.current.fetchStatus).toBe('idle');
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it('throws when axios.get returns falsy', async () => {
    axiosMock.get.mockResolvedValueOnce(null);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCourseDetails('777'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('calls correct EzyGo course URL', async () => {
    const rawData = { present: 5, absent: 2, total: 7, percentage: 71 };
    axiosMock.get.mockResolvedValueOnce({ data: rawData });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCourseDetails('123'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(axiosMock.get).toHaveBeenCalledWith(
      '/attendancereports/institutionuser/courses/123/summery'
    );
  });
});
