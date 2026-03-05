import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { useAttendanceReport, useCourseDetails, useAllCourseDetails } from '@/hooks/courses/attendance'
import { type AttendanceReport } from '@/types'
import axiosInstance from '@/lib/axios'

vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('@/lib/query-utils', () => ({
  retryOnce: () => false,
  retryTwice: () => false,
}))

describe('useAttendanceReport', () => {
  beforeEach(() => {
    // Clear all mocks before each test to prevent state pollution
    vi.clearAllMocks()
  })

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { 
          retry: false,
          // Disable background refetching for tests
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchInterval: false,
        },
      },
    })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
  }

  it('should fetch attendance report data successfully', async () => {
    const mockAttendanceReport: AttendanceReport = {
      courses: {},
      sessions: {},
      attendanceTypes: {},
      studentAttendanceData: {},
      attendanceDatesArray: {},
    }

    vi.mocked(axiosInstance.post).mockResolvedValueOnce({
      data: mockAttendanceReport,
    })

    const { result } = renderHook(() => useAttendanceReport(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockAttendanceReport)
  })

  it('should handle error state', async () => {
    vi.mocked(axiosInstance.post).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAttendanceReport(), {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 3000 }
    )
  })

  it('should respect enabled option', () => {
    const { result } = renderHook(() => useAttendanceReport({ enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.status).toBe('pending')
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('should fetch data when initialData is undefined', async () => {
    const mockAttendanceReport: AttendanceReport = {
      courses: {},
      sessions: {},
      attendanceTypes: {},
      studentAttendanceData: {},
      attendanceDatesArray: {},
    }

    vi.mocked(axiosInstance.post).mockResolvedValueOnce({
      data: mockAttendanceReport,
    })

    // Pass undefined (simulating null from SSR being normalized)
    const { result } = renderHook(
      () => useAttendanceReport({ initialData: undefined }),
      {
        wrapper: createWrapper(),
      }
    )

    // The query should fetch immediately when initialData is undefined
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockAttendanceReport)
    expect(axiosInstance.post).toHaveBeenCalledWith('/attendancereports/student/detailed')
  })

  it('should use initialData when provided and not trigger immediate fetch', () => {
    const mockInitialData: AttendanceReport = {
      courses: {},
      sessions: {},
      attendanceTypes: {},
      studentAttendanceData: {},
      attendanceDatesArray: {},
    }

    const { result } = renderHook(
      () => useAttendanceReport({ initialData: mockInitialData }),
      {
        wrapper: createWrapper(),
      }
    )

    // Should immediately have the initial data
    expect(result.current.data).toEqual(mockInitialData)
    expect(result.current.isSuccess).toBe(true)
    
    // Should not have called the API yet (using initialData)
    expect(axiosInstance.post).not.toHaveBeenCalled()
  })
})

describe('useCourseDetails', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchInterval: false,
        },
      },
    })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns normalised data (totel → total, persantage → percentage)', async () => {
    const rawData = { present: 15, absent: 5, totel: 20, persantage: 75 }
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: rawData })

    const { result } = renderHook(() => useCourseDetails('999'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(20)
    expect(result.current.data?.percentage).toBe(75)
    expect((result.current.data as any)?.totel).toBeUndefined()
    expect((result.current.data as any)?.persantage).toBeUndefined()
  })

  it('prefers existing total/percentage fields over typo fields', async () => {
    const rawData = {
      present: 10,
      absent: 5,
      total: 15,
      percentage: 66,
      totel: 99,
      persantage: 99,
    }
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: rawData })

    const { result } = renderHook(() => useCourseDetails('888'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(15)
    expect(result.current.data?.percentage).toBe(66)
  })

  it('does not fetch when courseId is empty string', () => {
    const { result } = renderHook(() => useCourseDetails(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(axiosInstance.get).not.toHaveBeenCalled()
  })

  it('throws when axios.get returns falsy', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValueOnce(null)

    const { result } = renderHook(() => useCourseDetails('777'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('calls correct EzyGo course URL', async () => {
    const rawData = { present: 5, absent: 2, total: 7, percentage: 71 }
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: rawData })

    const { result } = renderHook(() => useCourseDetails('123'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/attendancereports/institutionuser/courses/123/summery'
    )
  })
})

describe('useAllCourseDetails', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchInterval: false,
        },
      },
    })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'QueryClientWrapper'
    return { Wrapper, queryClient }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fetch when courseIds array is empty', () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAllCourseDetails([]), {
      wrapper: Wrapper,
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(axiosInstance.get).not.toHaveBeenCalled()
  })

  it('fetches all course summaries in parallel and returns a map', async () => {
    const raw101 = { present: 10, absent: 2, total: 12, percentage: 83 }
    const raw202 = { present: 5, absent: 5, totel: 10, persantage: 50 }
    vi.mocked(axiosInstance.get)
      .mockResolvedValueOnce({ data: raw101 })
      .mockResolvedValueOnce({ data: raw202 })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAllCourseDetails(['101', '202']), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.['101']).toMatchObject({ present: 10, absent: 2, total: 12 })
    expect(result.current.data?.['202']).toMatchObject({ present: 5, absent: 5, total: 10, percentage: 50 })
    expect((result.current.data?.['202'] as any)?.totel).toBeUndefined()
  })

  it('seeds per-course TanStack Query cache entries', async () => {
    const raw = { present: 8, absent: 2, total: 10, percentage: 80 }
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: raw })

    const { Wrapper, queryClient } = createWrapper()
    renderHook(() => useAllCourseDetails(['55', '66']), { wrapper: Wrapper })

    await waitFor(() =>
      expect(queryClient.getQueryData(['attendance-report', '55'])).toBeDefined()
    )
    expect(queryClient.getQueryData(['attendance-report', '66'])).toBeDefined()
  })

  it('calls the correct EzyGo summery URL for each course', async () => {
    const raw = { present: 3, absent: 1, total: 4, percentage: 75 }
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: raw })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAllCourseDetails(['111', '222']), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/attendancereports/institutionuser/courses/111/summery'
    )
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/attendancereports/institutionuser/courses/222/summery'
    )
  })

  it('enters error state when a fetch fails', async () => {
    vi.mocked(axiosInstance.get).mockRejectedValueOnce(new Error('Network error'))

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAllCourseDetails(['99']), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
