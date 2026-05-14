import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axiosInstance, { getCookie, getCsrfToken, setCsrfToken } from '../axios';
import { logger } from '@/lib/logger';
import { encryptRequest, encryptHeader, decryptResponse } from '@/lib/security/jwe-client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/security/jwe-client', () => ({
  encryptRequest: vi.fn().mockResolvedValue({ jwe: 'mocked-jwe-body', cek: new Uint8Array([1, 2, 3]) }),
  encryptHeader: vi.fn().mockResolvedValue({ jwe: 'mocked-jwe-header', cek: new Uint8Array([4, 5, 6]) }),
  decryptResponse: vi.fn().mockResolvedValue({ decrypted: 'data' }),
}));

vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('axios lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock sessionStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value; }),
      removeItem: vi.fn((key) => { delete store[key]; }),
    });

    // Mock document.cookie
    vi.stubGlobal('document', {
      cookie: '',
      querySelector: vi.fn().mockReturnValue(null),
    });

    // Mock window
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:3000' },
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getCookie', () => {
    it('returns null when document is undefined', () => {
      vi.stubGlobal('document', undefined);
      expect(getCookie('test')).toBe(null);
    });

    it('retrieves a cookie value', () => {
      document.cookie = 'foo=bar; baz=qux';
      expect(getCookie('foo')).toBe('bar');
      expect(getCookie('baz')).toBe('qux');
      expect(getCookie('none')).toBe(null);
    });
  });

  describe('CSRF Token Management', () => {
    const VALID_TOKEN = 'a'.repeat(64); // 64 hex chars

    it('sets and gets CSRF token', () => {
      setCsrfToken(VALID_TOKEN);
      expect(getCsrfToken()).toBe(VALID_TOKEN);
      expect(sessionStorage.setItem).toHaveBeenCalledWith('csrf_token_memory', VALID_TOKEN);
    });

    it('rejects invalid CSRF tokens', () => {
      setCsrfToken('short');
      expect(getCsrfToken()).toBe(null);
      expect(logger.error).toHaveBeenCalledWith('[CSRF] Invalid token format');

      setCsrfToken('not-hex' + 'a'.repeat(57));
      expect(getCsrfToken()).toBe(null);
    });

    it('removes CSRF token when null is passed', () => {
      setCsrfToken(VALID_TOKEN);
      setCsrfToken(null);
      expect(getCsrfToken()).toBe(null);
      expect(sessionStorage.removeItem).toHaveBeenCalledWith('csrf_token_memory');
    });

    it('logs CSP warning in production if meta tag is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      
      try {
        getCsrfToken();
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No CSP meta tag detected'));
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('Request Interceptor', () => {
    it('attaches CSRF header if token exists', async () => {
      setCsrfToken('a'.repeat(64));
      
      const config = { 
        url: '/api/test', 
        method: 'get', 
        headers: new Map() 
      } as any;
      
      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.request.handlers[0].fulfilled;
      const resultConfig = await interceptor(config);
      
      expect(resultConfig.headers.get('x-csrf-token')).toBe('a'.repeat(64));
    });

    it('encrypts POST request body (JWE)', async () => {
      const config = { 
        url: '/api/mutation', 
        method: 'post', 
        data: { foo: 'bar' },
        headers: new Map() 
      } as any;
      
      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.request.handlers[0].fulfilled;
      const resultConfig = await interceptor(config);
      
      expect(encryptRequest).toHaveBeenCalledWith({ foo: 'bar' });
      expect(resultConfig.data).toBe('mocked-jwe-body');
      expect((resultConfig as any)._jweCek).toEqual(new Uint8Array([1, 2, 3]));
      expect(resultConfig.headers.get('Content-Type')).toBe('application/jose');
    });

    it('encrypts GET request header (JWE)', async () => {
      const config = { 
        url: '/api/data', 
        method: 'get', 
        headers: new Map() 
      } as any;
      
      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.request.handlers[0].fulfilled;
      const resultConfig = await interceptor(config);
      
      expect(encryptHeader).toHaveBeenCalled();
      expect(resultConfig.headers.get('X-JWE-Key')).toBe('mocked-jwe-header');
      expect((resultConfig as any)._jweCek).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('Response Interceptor', () => {
    it('decrypts application/jose response', async () => {
      const response = {
        headers: { 'content-type': 'application/jose' },
        data: 'encrypted-data',
        config: { _jweCek: new Uint8Array([1, 2, 3]) }
      } as any;
      
      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.response.handlers[0].fulfilled;
      const result = await interceptor(response);
      
      expect(decryptResponse).toHaveBeenCalledWith('encrypted-data', expect.any(Uint8Array));
      expect(result.data).toEqual({ decrypted: 'data' });
    });

    it('handles 403 CSRF error by refreshing token and retrying', async () => {
      const error = {
        config: { url: '/api/test', _csrfRetried: false, headers: new Map() },
        response: { 
          status: 403, 
          data: { message: 'Invalid CSRF Token' } 
        }
      } as any;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'b'.repeat(64) })
      });

      const requestSpy = vi.spyOn(axiosInstance, 'request').mockResolvedValue({ data: 'success' } as any);
      
      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.response.handlers[0].rejected;
      if (interceptor) await interceptor(error);
      
      expect(mockFetch).toHaveBeenCalledWith('/api/csrf', expect.any(Object));
      expect(getCsrfToken()).toBe('b'.repeat(64));
      expect(requestSpy).toHaveBeenCalled();
    });

    it('handles 401 error by attempting session sync', async () => {
      const error = {
        config: { url: '/api/test', _authRetried: false },
        response: { status: 401 }
      } as any;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      const requestSpy = vi.spyOn(axiosInstance, 'request').mockResolvedValue({ data: 'success' } as any);

      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.response.handlers[0].rejected;
      if (interceptor) await interceptor(error);
      
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/sync', expect.any(Object));
      expect(requestSpy).toHaveBeenCalled();
    });

    it('handles 401 error and logs out if session sync fails', async () => {
      const error = {
        config: { url: '/api/test', _authRetried: false },
        response: { status: 401 }
      } as any;
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });
      
      const { handleLogout } = await import('@/lib/security/auth');

      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.response.handlers[0].rejected;
      try {
        if (interceptor) await interceptor(error);
      } catch (e) {
        logger.dev("Expected rejection in test", e);
      }
      
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  describe('Encryption Errors', () => {
    it('logs error if JWE encryption fails', async () => {
      const config = { 
        url: '/api/mutation', 
        method: 'post', 
        data: { foo: 'bar' },
        headers: new Map() 
      } as any;
      
      vi.mocked(encryptRequest).mockRejectedValueOnce(new Error('Cipher error'));

      // @ts-expect-error -- accessing private interceptor handler for testing
      const interceptor = axiosInstance.interceptors.request.handlers[0].fulfilled;
      await expect(interceptor(config)).rejects.toThrow('Cipher error');
      expect(logger.error).toHaveBeenCalledWith('[axios] JWE request encryption failed', expect.any(Error));
    });
  });
});
