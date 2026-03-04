import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { useAttendanceReport, useCourseDetails } from '@/hooks/courses/attendance'
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
