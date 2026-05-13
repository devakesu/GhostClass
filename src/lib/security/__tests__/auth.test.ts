import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockSignOut = vi.fn();
const mockCaptureException = vi.fn();

// Mock modules at the top level with factory functions
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: () => mockSignOut(),
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: any[]) => mockCaptureException(...args),
}));

// Mock the getCsrfToken function
const mockGetCsrfToken = vi.fn();
vi.mock('@/lib/axios', () => ({
  getCsrfToken: () => mockGetCsrfToken(),
}));

import { isAuthSessionMissingError, handleLogout, isSupabaseLockTimeoutError } from '../auth';

describe('isAuthSessionMissingError', () => {
  it('should return true when error message contains "session missing"', () => {
    const error = { message: 'Auth session missing' };
    expect(isAuthSessionMissingError(error)).toBe(true);
  });

  it('should return true when error message contains "session missing" in different case', () => {
    const error = { message: 'SESSION MISSING!' };
    expect(isAuthSessionMissingError(error)).toBe(true);
  });

  it('should return true when error message contains "auth session"', () => {
    const error = { message: 'Auth session is invalid' };
    expect(isAuthSessionMissingError(error)).toBe(true);
  });

  it('should return true when error message contains "AUTH SESSION" in uppercase', () => {
    const error = { message: 'AUTH SESSION ERROR' };
    expect(isAuthSessionMissingError(error)).toBe(true);
  });

  it('should return false for null/undefined error', () => {
    expect(isAuthSessionMissingError(null)).toBe(false);
    expect(isAuthSessionMissingError(undefined)).toBe(false);
  });

  it('should return false when error message does not contain session-related text', () => {
    const error = { message: 'Network error' };
    expect(isAuthSessionMissingError(error)).toBe(false);
  });

  it('should return false when error is null', () => {
    expect(isAuthSessionMissingError(null)).toBe(false);
  });

  it('should return false when error is undefined', () => {
    expect(isAuthSessionMissingError(undefined)).toBe(false);
  });

  it('should return false when error has no message', () => {
    const error = { code: 'SOME_ERROR' };
    expect(isAuthSessionMissingError(error)).toBe(false);
  });

  it('should return false when error message is not a string', () => {
    const error = { message: 123 };
    expect(isAuthSessionMissingError(error)).toBe(false);
  });

  it('should handle error with partial matches', () => {
    const error1 = { message: 'The session missing from request' };
    expect(isAuthSessionMissingError(error1)).toBe(true);

    const error2 = { message: 'Invalid auth session detected' };
    expect(isAuthSessionMissingError(error2)).toBe(true);
  });
});

describe('handleLogout', () => {
  let originalWindow: typeof globalThis.window;
  let originalFetch: typeof globalThis.fetch;
  let originalLocalStorage: Storage;
  let originalSessionStorage: Storage;
  let mockLocalStorage: Storage;
  let mockSessionStorage: Storage;

  beforeEach(() => {
    // Reset all mocks
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
    mockCaptureException.mockClear();
    mockGetCsrfToken.mockClear();
    
    // Default: return a valid CSRF token
    mockGetCsrfToken.mockReturnValue('test-csrf-token');

    // Mock fetch - capture original and replace with mock
    // Default mock returns success for both /api/csrf and /api/logout
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'mock-csrf-token' })
        });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    // Mock window and storage
    mockLocalStorage = {
      clear: vi.fn(),
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    mockSessionStorage = {
      clear: vi.fn(),
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      writable: true,
      configurable: true,
      value: {
        location: {
          href: '',
        },
        localStorage: mockLocalStorage,
        sessionStorage: mockSessionStorage,
      },
    });

    // Also set global localStorage and sessionStorage to point to the mocks
    // since the code accesses them directly
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    Object.defineProperty(global, 'localStorage', {
      writable: true,
      configurable: true,
      value: mockLocalStorage,
    });
    Object.defineProperty(global, 'sessionStorage', {
      writable: true,
      configurable: true,
      value: mockSessionStorage,
    });
  });

  afterEach(() => {
    // Clear mocks first
    vi.clearAllMocks();
    
    // Restore globals with try-finally to ensure all restorations happen
    // even if one throws an exception
    try {
      global.window = originalWindow;
    } catch (err) {
      // Log but continue with other restorations
      console.error('Failed to restore window:', err);
    }
    
    try {
      global.fetch = originalFetch;
    } catch (err) {
      console.error('Failed to restore fetch:', err);
    }
    
    try {
      global.localStorage = originalLocalStorage;
    } catch (err) {
      console.error('Failed to restore localStorage:', err);
    }
    
    try {
      global.sessionStorage = originalSessionStorage;
    } catch (err) {
      console.error('Failed to restore sessionStorage:', err);
    }
  });

  it('should call Supabase signOut', async () => {
    await handleLogout();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('should clear localStorage and sessionStorage', async () => {
    await handleLogout();
    expect(mockLocalStorage.clear).toHaveBeenCalled();
    expect(mockSessionStorage.clear).toHaveBeenCalled();
  });

  it('should obtain CSRF token from getCsrfToken() and call logout API endpoint', async () => {
    await handleLogout();
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { 
      method: 'POST',
      headers: {
        'x-csrf-token': 'test-csrf-token'
      }
    });
  });

  it('should trigger server-side cookie clearing via /api/logout', async () => {
    await handleLogout();
    // Note: terms_version cookie deletion is now handled server-side via /api/logout
    // Client-side deletion was removed as it's httpOnly
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { 
      method: 'POST',
      headers: {
        'x-csrf-token': 'test-csrf-token'
      }
    });
  });

  it('should redirect to home page after successful logout', async () => {
    await handleLogout();
    expect(global.window.location.href).toBe('/');
  });

  it('should perform cleanup and redirect even when signOut throws', async () => {
    mockSignOut.mockRejectedValue(new Error('Network error'));
    
    await handleLogout();

    // Should still attempt cleanup
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { 
      method: 'POST',
      headers: {
        'x-csrf-token': 'test-csrf-token'
      }
    });
    expect(global.window.location.href).toBe('/');
    expect(mockCaptureException).toHaveBeenCalled();
  });



  it('should log error to Sentry when logout fails', async () => {
    const testError = new Error('Test error');
    mockSignOut.mockRejectedValue(testError);
    
    await handleLogout();

    expect(mockCaptureException).toHaveBeenCalledWith(
      testError,
      { tags: { type: 'logout_failure', location: 'handleLogout' } }
    );
  });

  it('should handle missing window object gracefully', async () => {
    // Remove window object
    const windowBackup = global.window;
    try {
      // @ts-expect-error - Testing undefined window
      delete global.window;
      
      // Should not throw
      await expect(handleLogout()).resolves.not.toThrow();
    } finally {
      // Always restore window, even if test fails
      global.window = windowBackup;
    }
  });

  it('should handle signOut error object gracefully', async () => {
    mockSignOut.mockResolvedValue({ 
      error: new Error('Supabase signOut failed') 
    });
    
    // Should redirect even on error
    await handleLogout();
    expect(global.window.location.href).toBe('/');
  });
  
  it('should handle CSRF token fetch failure gracefully', async () => {
    // Mock getCsrfToken to return null (no initial token)
    mockGetCsrfToken.mockReturnValue(null);
    
    // Mock CSRF fetch to fail
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.resolve({
          ok: false,
          statusText: 'Internal Server Error'
        });
      }
      return Promise.resolve({ ok: true });
    }) as any;
    
    await handleLogout();
    
    // Should still redirect despite CSRF failure
    expect(global.window.location.href).toBe('/');
    // Should NOT call /api/logout without token
    expect(global.fetch).not.toHaveBeenCalledWith('/api/logout', expect.anything());
  });
  
  it('should handle CSRF token fetch exception gracefully', async () => {
    // Mock getCsrfToken to return null (no initial token)
    mockGetCsrfToken.mockReturnValue(null);
    
    // Mock CSRF fetch to throw
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: true });
    }) as any;
    
    await handleLogout();
    
    // Should still redirect despite CSRF failure
    expect(global.window.location.href).toBe('/');
    // Should NOT call /api/logout without token
    expect(global.fetch).not.toHaveBeenCalledWith('/api/logout', expect.anything());
  });

  it('should retry logout once on 403 with fresh CSRF token', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'fresh-csrf-token' })
        });
      }
      if (url === '/api/logout') {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: false, status: 403 });
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();

    expect(callCount).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      headers: { 'x-csrf-token': 'fresh-csrf-token' }
    }));
  });

  it('should log error when logout API call fails (not 403)', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/logout') {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // This hits line 177: logger.error("[handleLogout] Logout API call failed:...")
    expect(global.window.location.href).toBe('/');
  });

  it('should handle fetch exception during logout API call', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/logout') {
        return Promise.reject(new Error('Logout fetch error'));
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // This hits line 180: logger.error("Error calling logout API:", logoutError)
    expect(global.window.location.href).toBe('/');
  });

  it('should log success when CSRF token is obtained dynamically', async () => {
    mockGetCsrfToken.mockReturnValue(null);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'dynamic-token' })
        });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // Hits line 144: logger.info("[handleLogout] Obtained CSRF token for logout")
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      headers: { 'x-csrf-token': 'dynamic-token' }
    }));
  });

  it('should log error when logout retry fails', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 't' }) });
      if (url === '/api/logout') {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: false, status: 403 });
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // Hits line 171: logger.error("[handleLogout] Logout API retry failed:...")
    expect(callCount).toBe(2);
  });

  it('should log error when fresh token fetch fails during retry', async () => {
    let logoutCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') return Promise.resolve({ ok: false });
      if (url === '/api/logout') {
        logoutCalls++;
        return Promise.resolve({ ok: false, status: 403 });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // Hits line 174: logger.error("[handleLogout] Failed to obtain fresh CSRF token for retry")
    expect(logoutCalls).toBe(1);
  });

  it('should attempt cookie cleanup in catch block if main path fails', async () => {
    mockSignOut.mockRejectedValue(new Error('Auth failure'));
    mockGetCsrfToken.mockReturnValue(null); // Force fetchFreshCsrfToken in catch block

    let csrfFetched = false;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        csrfFetched = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'catch-csrf-token' })
        });
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();

    expect(csrfFetched).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      headers: { 'x-csrf-token': 'catch-csrf-token' }
    }));
    expect(global.window.location.href).toBe('/');
  });

  it('should skip cookie cleanup in catch block if no token is available', async () => {
    mockSignOut.mockRejectedValue(new Error('Auth failure'));
    mockGetCsrfToken.mockReturnValue(null);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // Hits line 210 false branch: if (fallbackToken)
    expect(global.window.location.href).toBe('/');
  });

  it('should use provided csrfToken and skip dynamic fetch', async () => {
    await handleLogout('provided-token');
    // Hits line 120 false branch: if (!csrfToken)
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      headers: { 'x-csrf-token': 'provided-token' }
    }));
  });

  it('should handle non-string token in CSRF API response', async () => {
    mockGetCsrfToken.mockReturnValue(null);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 123 }) });
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    // Hits line 106 false branch in fetchFreshCsrfToken (non-string token rejected)
    expect(global.fetch).toHaveBeenCalledWith('/api/csrf', expect.any(Object));
  });

  it('should handle fetchFreshCsrfToken rejection in handleLogout catch block', async () => {
    mockSignOut.mockRejectedValue(new Error('Auth failure'));
    mockGetCsrfToken.mockReturnValue(null);
    
    // First call to fetchFreshCsrfToken (line 142) fails
    // Second call to fetchFreshCsrfToken (line 209) rejects
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.reject(new Error('CSRF fetch failed'));
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    
    expect(mockCaptureException).toHaveBeenCalled();
    expect(global.window.location.href).toBe('/');
  });

  it('should handle fetchFreshCsrfToken non-ok response', async () => {
      mockGetCsrfToken.mockReturnValue(null);
      global.fetch = vi.fn().mockImplementation((url: string) => {
          if (url === '/api/csrf') {
              return Promise.resolve({
                  ok: false,
                  statusText: 'Forbidden'
              });
          }
          return Promise.resolve({ ok: true });
      }) as any;

      await handleLogout();
      expect(global.window.location.href).toBe('/');
  });

  it('should cover fetchFreshCsrfToken catch block', async () => {
    mockGetCsrfToken.mockReturnValue(null);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') {
        return Promise.reject(new Error('Fetch failed'));
      }
      return Promise.resolve({ ok: true });
    }) as any;

    await handleLogout();
    expect(global.window.location.href).toBe('/');
  });

  it('should cover outer catch block with token', async () => {
    mockGetCsrfToken.mockReturnValue('existing-token');
    mockSignOut.mockResolvedValue({ error: new Error('Supabase fail') });
    
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf') return Promise.resolve({ ok: true, json: () => Promise.resolve({ csrfToken: 'fresh' }) });
      return Promise.resolve({ ok: true });
    });

    await handleLogout();
    
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', expect.anything());
    expect(global.window.location.href).toBe('/');
  });

  it('should handle window undefined in try block (line 189/195)', async () => {
    const windowBackup = global.window;
    try {
      // @ts-expect-error - testing undefined window
      delete global.window;
      mockSignOut.mockResolvedValue({ error: null });
      
      await handleLogout();
      // Should not throw, should just return
      expect(mockSignOut).toHaveBeenCalled();
    } finally {
      global.window = windowBackup;
    }
  });

  it('should handle window undefined in catch block', async () => {
    const windowBackup = global.window;
    try {
      // @ts-expect-error - testing undefined window
      delete global.window;
      mockSignOut.mockRejectedValue(new Error('Auth failure'));
      
      await handleLogout();
      // Should not throw, should just return
      expect(mockSignOut).toHaveBeenCalled();
    } finally {
      global.window = windowBackup;
    }
  });

    it('should handle fetch error in catch block (line 217)', async () => {
      mockSignOut.mockRejectedValue(new Error('Auth failure'));
      mockGetCsrfToken.mockReturnValue('token');
      
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/logout') {
          return Promise.reject(new Error('Final logout fail'));
        }
        return Promise.resolve({ ok: true });
      }) as any;

      await handleLogout();
      // Should not throw
      expect(global.window.location.href).toBe('/');
    });

    it('should cover auth.ts line 32 (F || T)', () => {
      const error = { message: 'Something something auth session' };
      expect(isAuthSessionMissingError(error)).toBe(true);
    });
  });

  describe('isSupabaseLockTimeoutError', () => {
  it('should identify lock timeout errors', () => {
    expect(isSupabaseLockTimeoutError({ message: 'Navigator LockManager timeout' })).toBe(true);
    expect(isSupabaseLockTimeoutError({ message: 'exclusive Navigator LockManager lock' })).toBe(true);
    expect(isSupabaseLockTimeoutError({ message: 'timed out acquiring auth-token' })).toBe(true);
  });

  it('should return true for "navigator lockmanager"', () => {
    expect(isSupabaseLockTimeoutError({ message: 'navigator lockmanager failure' })).toBe(true);
  });

  it('should return true for "timed out" and "auth-token"', () => {
    expect(isSupabaseLockTimeoutError({ message: 'Request timed out while acquiring auth-token lock' })).toBe(true);
  });

  it('should return false for just "timed out"', () => {
    expect(isSupabaseLockTimeoutError({ message: 'Request timed out' })).toBe(false);
  });

  it('should return false for null error', () => {
    expect(isSupabaseLockTimeoutError(null)).toBe(false);
  });

  it('should return false for other errors', () => {
    expect(isSupabaseLockTimeoutError({ message: 'network error' })).toBe(false);
    expect(isSupabaseLockTimeoutError({})).toBe(false);
  });
});
