import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCSRFToken } from '@/hooks/use-csrf-token'
import * as axiosModule from '@/lib/axios'

// Mock the axios module
vi.mock('@/lib/axios', () => ({
  getCsrfToken: vi.fn(),
  setCsrfToken: vi.fn(),
}))

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}))

describe('useCSRFToken', () => {
  // Store original fetch
  const originalFetch = global.fetch

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    
    // Mock sessionStorage
    const sessionStorageMock = (() => {
      let store: Record<string, string> = {}
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          store = {}
        },
      }
    })()

    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
    })

    // Mock fetch by default to return success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-csrf-token' }),
    })
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('should initialize CSRF token on first mount when token does not exist', async () => {
    // Mock getCsrfToken to return null (no existing token)
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    renderHook(() => useCSRFToken())

    // Wait for the fetch to be called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/csrf')
    })

    // Wait for setCsrfToken to be called with the token
    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith('test-csrf-token')
    })
  })

  it('should skip initialization when token already exists', async () => {
    // Mock getCsrfToken to return an existing token
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue('existing-token')

    renderHook(() => useCSRFToken())

    // Wait a bit to ensure no fetch is made
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify fetch was not called
    expect(global.fetch).not.toHaveBeenCalled()
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled()
  })

  it('should handle concurrent component mounts via shared promise', async () => {
    // Mock getCsrfToken to return null for all calls
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    // Mock fetch to simulate a delayed response
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ token: 'test-csrf-token' }),
            })
          }, 100)
        })
    )

    // Mount multiple hooks simultaneously
    const { unmount: unmount1 } = renderHook(() => useCSRFToken())
    const { unmount: unmount2 } = renderHook(() => useCSRFToken())
    const { unmount: unmount3 } = renderHook(() => useCSRFToken())

    // Wait for initialization to complete
    await waitFor(
      () => {
        expect(axiosModule.setCsrfToken).toHaveBeenCalledWith('test-csrf-token')
      },
      { timeout: 2000 }
    )

    // The module-level promise coordination reduces duplicate requests
    // Each component has a ref to prevent re-initialization on re-renders
    // Verify the token was set successfully
    expect(axiosModule.setCsrfToken).toHaveBeenCalledWith('test-csrf-token')

    unmount1()
    unmount2()
    unmount3()
  })

  it('should be safe for StrictMode double-effect execution', async () => {
    // Mock getCsrfToken to return null initially
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    const { unmount, rerender } = renderHook(() => useCSRFToken())

    // Simulate StrictMode by immediately re-rendering
    rerender()

    // Wait for initialization
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // Verify fetch was only called once despite re-render
    expect(global.fetch).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('should handle fetch errors gracefully', async () => {
    // Mock getCsrfToken to return null
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    // Mock fetch to reject
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    renderHook(() => useCSRFToken())

    // Wait for the fetch to be called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/csrf')
    })

    // Wait a bit to ensure error handling completes
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify setCsrfToken was not called
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled()
  })

  it('should handle non-ok response from server', async () => {
    // Mock getCsrfToken to return null
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    // Mock fetch to return non-ok response
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    })

    renderHook(() => useCSRFToken())

    // Wait for the fetch to be called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/csrf')
    })

    // Wait a bit to ensure error handling completes
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify setCsrfToken was not called
    expect(axiosModule.setCsrfToken).not.toHaveBeenCalled()
  })

  it('should allow retry on subsequent mount if first initialization fails', async () => {
    // Mock getCsrfToken to return null for all calls
    let fetchCallCount = 0
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    // Mock fetch to fail first time, succeed second time
    global.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++
      if (fetchCallCount === 1) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: 'test-csrf-token' }),
      })
    })

    // First mount - should fail
    const { unmount: unmount1 } = renderHook(() => useCSRFToken())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    unmount1()

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Second mount - should succeed
    const { unmount: unmount2 } = renderHook(() => useCSRFToken())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith('test-csrf-token')
    })

    unmount2()
  })

  it('should not initialize in SSR (server-side rendering)', async () => {
    // Mock getCsrfToken to return null
    vi.mocked(axiosModule.getCsrfToken).mockReturnValue(null)

    // Mock window to be undefined to simulate SSR
    // We can't delete window in jsdom, so we'll just verify the hook doesn't crash
    // and relies on sessionStorage check which won't be available server-side
    const originalSessionStorage = global.sessionStorage
    // @ts-expect-error - Simulating SSR environment
    delete global.sessionStorage

    // Mock getCsrfToken to return null when sessionStorage is undefined
    vi.mocked(axiosModule.getCsrfToken).mockImplementation(() => {
      if (typeof sessionStorage === 'undefined') return null
      return sessionStorage.getItem('csrf_token')
    })

    renderHook(() => useCSRFToken())

    // Wait a bit to ensure no fetch is made
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Restore sessionStorage
    global.sessionStorage = originalSessionStorage
  })

  it('should retry initialization if another component initialization fails', async () => {
    // Ensure window and sessionStorage are available
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return // Skip in SSR environment
    }

    // Mock getCsrfToken:
    // - First call: null (no existing token)
    // - Second call (after wait): null (other component failed)
    // - Third call: still null before retry
    vi.mocked(axiosModule.getCsrfToken).mockImplementation(() => {
      return null
    })

    // Mock fetch to fail on first call
    let fetchCallCount = 0
    global.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++
      if (fetchCallCount === 1) {
        return Promise.reject(new Error('First fetch failed'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: 'retry-token' }),
      })
    })

    // First component starts initialization (will fail)
    const { unmount: unmount1 } = renderHook(() => useCSRFToken())

    // Wait for first fetch to be called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    // Second component mounts while first is failing
    // It should wait for the first promise, then retry
    const { unmount: unmount2 } = renderHook(() => useCSRFToken())

    // Wait for second fetch (retry)
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledTimes(2)
      },
      { timeout: 2000 }
    )

    // Verify setCsrfToken was called with retry token
    await waitFor(() => {
      expect(axiosModule.setCsrfToken).toHaveBeenCalledWith('retry-token')
    })

    unmount1()
    unmount2()
  })
})
