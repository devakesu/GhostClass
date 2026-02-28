import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchEzygoData, getRateLimiterStats, resetRateLimiterState } from '../ezygo-batch-fetcher';

// Mock server-only to allow tests to run
vi.mock('server-only', () => ({}));

// Mock the circuit breaker to passthrough execution
vi.mock('../circuit-breaker', () => ({
  ezygoCircuitBreaker: {
    execute: vi.fn((fn) => fn()),
  },
  CircuitBreakerOpenError: class CircuitBreakerOpenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CircuitBreakerOpenError';
    }
  },
  NonBreakerError: class NonBreakerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NonBreakerError';
    }
  },
}));

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('EzyGo Batch Fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset rate limiter state to avoid test interference
    resetRateLimiterState();
    // Reset fetch mock before each test
    global.fetch = vi.fn();
    
    // Set required environment variable
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com';
    delete process.env.CF_PROXY_URL;
    delete process.env.CF_PROXY_SECRET;
    delete process.env.AWS_SECONDARY_URL;
    delete process.env.AWS_SECONDARY_SECRET;
  });

  afterEach(() => {
    // Don't clean up in afterEach since some tests need to modify it
    // Each test should handle its own cleanup if needed
  });

  describe('Request Deduplication', () => {
    it('should deduplicate identical in-flight requests', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';
      const endpoint = '/myprofile';

      // Make 3 concurrent identical requests
      const promises = [
        fetchEzygoData(endpoint, token),
        fetchEzygoData(endpoint, token),
        fetchEzygoData(endpoint, token),
      ];

      const results = await Promise.all(promises);

      // All should return the same result
      expect(results).toEqual([mockResponse, mockResponse, mockResponse]);
      
      // But fetch should only be called once due to deduplication
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should use separate cache keys for different methods', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';
      const endpoint = '/endpoint';

      // Make GET and POST requests to the same endpoint
      await Promise.all([
        fetchEzygoData(endpoint, token, 'GET'),
        fetchEzygoData(endpoint, token, 'POST', {}),
      ]);

      // Should make 2 separate requests (different methods)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use separate cache keys for different tokens', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const endpoint = '/myprofile';

      // Make requests with different tokens
      await Promise.all([
        fetchEzygoData(endpoint, 'token-1'),
        fetchEzygoData(endpoint, 'token-2'),
      ]);

      // Should make 2 separate requests (different tokens)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use separate cache keys for different request bodies', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';
      const endpoint = '/endpoint';

      // Make POST requests with different bodies
      await Promise.all([
        fetchEzygoData(endpoint, token, 'POST', { param: 'value1' }),
        fetchEzygoData(endpoint, token, 'POST', { param: 'value2' }),
      ]);

      // Should make 2 separate requests (different bodies)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate endpoints with and without leading slash', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';

      // Make concurrent requests with /endpoint and endpoint
      const promises = [
        fetchEzygoData('/myprofile', token),
        fetchEzygoData('myprofile', token),
      ];

      const results = await Promise.all(promises);

      // Both should return the same result
      expect(results).toEqual([mockResponse, mockResponse]);
      
      // But fetch should only be called once due to endpoint normalization
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should generate distinct cache keys for undefined vs {} vs null body', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';
      const endpoint = '/endpoint';

      // Make POST requests with undefined (omitted), {}, and null bodies
      await Promise.all([
        fetchEzygoData(endpoint, token, 'POST', undefined),
        fetchEzygoData(endpoint, token, 'POST', {}),
        fetchEzygoData(endpoint, token, 'POST', null),
      ]);

      // Should make 3 separate requests (distinct body semantics)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should deduplicate requests with same body (including undefined)', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const token = 'test-token';
      const endpoint = '/endpoint';

      // Make multiple GET requests (no body = undefined)
      const promises = [
        fetchEzygoData(endpoint, token, 'GET'),
        fetchEzygoData(endpoint, token, 'GET'),
        fetchEzygoData(endpoint, token, 'GET'),
      ];

      const results = await Promise.all(promises);

      // All should return the same result
      expect(results).toEqual([mockResponse, mockResponse, mockResponse]);
      
      // But fetch should only be called once (deduplication)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce max concurrent requests (3)', async () => {
      let activeRequests = 0;
      let maxConcurrent = 0;

      (global.fetch as any).mockImplementation(async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        activeRequests--;
        return {
          ok: true,
          json: async () => ({ data: 'test' }),
        };
      });

      const token = 'test-token';
      
      // Make 10 requests with different endpoints to avoid deduplication
      const promises = Array.from({ length: 10 }, (_, i) => 
        fetchEzygoData(`/endpoint-${i}`, token)
      );

      await Promise.all(promises);

      // Max concurrent should not exceed 3
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should queue requests when limit is reached', async () => {
      const stats = getRateLimiterStats();
      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('maxConcurrent');
      expect(stats.maxConcurrent).toBe(3);
    });
  });

  describe('Timeout Signal Cleanup', () => {
    it('should clean up timeout timers after successful fetch', async () => {
      // Mock AbortSignal.timeout to be unavailable to force fallback path with setTimeout
      const originalTimeout = AbortSignal.timeout;
      (AbortSignal as any).timeout = undefined;
      
      try {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        
        const mockResponse = { data: 'test' };
        (global.fetch as any).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const token = 'test-token';
        const endpoint = '/myprofile';

        // Make a request
        await fetchEzygoData(endpoint, token);
        
        // clearTimeout should be called to clean up the timer
        expect(clearTimeoutSpy).toHaveBeenCalled();
        
        clearTimeoutSpy.mockRestore();
      } finally {
        (AbortSignal as any).timeout = originalTimeout;
        resetRateLimiterState();
      }
    });

    it('should clean up timeout timers after failed fetch', async () => {
      // Mock AbortSignal.timeout to be unavailable to force fallback path with setTimeout
      const originalTimeout = AbortSignal.timeout;
      (AbortSignal as any).timeout = undefined;
      
      try {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        
        const mockError = new Error('Network error');
        (global.fetch as any).mockRejectedValue(mockError);

        const token = 'test-token';
        const endpoint = '/myprofile';

        // Make a request that will fail
        try {
          await fetchEzygoData(endpoint, token);
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toBe('Network error');
        }
        
        // clearTimeout should be called even after error
        expect(clearTimeoutSpy).toHaveBeenCalled();
        
        clearTimeoutSpy.mockRestore();
      } finally {
        (AbortSignal as any).timeout = originalTimeout;
        resetRateLimiterState();
      }
    });

    it('should clean up timeout timers for multiple concurrent requests', async () => {
      // Mock AbortSignal.timeout to be unavailable to force fallback path with setTimeout
      const originalTimeout = AbortSignal.timeout;
      (AbortSignal as any).timeout = undefined;
      
      try {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        
        const mockResponse = { data: 'test' };
        (global.fetch as any).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const token = 'test-token';

        // Make multiple requests with different endpoints (no deduplication)
        await Promise.all([
          fetchEzygoData('/endpoint1', token),
          fetchEzygoData('/endpoint2', token),
          fetchEzygoData('/endpoint3', token),
        ]);
        
        // clearTimeout should be called for each request: once for the batch-fetcher's
        // own createTimeoutSignal fallback, and once for egressFetch's per-tier timeout.
        expect(clearTimeoutSpy).toHaveBeenCalledTimes(6);
        
        clearTimeoutSpy.mockRestore();
      } finally {
        (AbortSignal as any).timeout = originalTimeout;
        resetRateLimiterState();
      }
    });
  });

  describe('API Request Construction', () => {
    it('should construct correct URL for GET requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('/myprofile', 'test-token', 'GET');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://api.example.com/myprofile');
      expect(calledInit.method).toBe('GET');
      const h = calledInit.headers as Headers;
      expect(h.get('Authorization')).toBe('Bearer test-token');

      // Verify Content-Type is NOT set for GET requests
      expect(h.get('Content-Type')).toBeNull();
    });

    it('should include body for POST requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      const body = { key: 'value' };
      await fetchEzygoData('/endpoint', 'test-token', 'POST', body);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://api.example.com/endpoint');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.body).toBe(JSON.stringify(body));
      const h = calledInit.headers as Headers;
      expect(h.get('Authorization')).toBe('Bearer test-token');
      expect(h.get('Content-Type')).toBe('application/json');
    });

    it('should prefer CF proxy URL and include CF secret header when configured', async () => {
      process.env.CF_PROXY_URL = 'https://cf-proxy.example.com/';
      process.env.CF_PROXY_SECRET = 'cf-secret';

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('/myprofile', 'test-token', 'GET');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://cf-proxy.example.com/myprofile');
      expect(calledInit.method).toBe('GET');
      const h = calledInit.headers as Headers;
      expect(h.get('Authorization')).toBe('Bearer test-token');
      expect(h.get('x-proxy-secret')).toBe('cf-secret');
    });

    it('should fall back to AWS secondary URL and include AWS secret header when CF is absent', async () => {
      process.env.AWS_SECONDARY_URL = 'https://aws-proxy.example.com/';
      process.env.AWS_SECONDARY_SECRET = 'aws-secret';

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('/myprofile', 'test-token', 'GET');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://aws-proxy.example.com/myprofile');
      expect(calledInit.method).toBe('GET');
      const h = calledInit.headers as Headers;
      expect(h.get('Authorization')).toBe('Bearer test-token');
      expect(h.get('x-proxy-secret')).toBe('aws-secret');
    });

    it('should prefer CF over AWS when both egress tiers are configured', async () => {
      process.env.CF_PROXY_URL = 'https://cf-proxy.example.com/';
      process.env.CF_PROXY_SECRET = 'cf-secret';
      process.env.AWS_SECONDARY_URL = 'https://aws-proxy.example.com/';
      process.env.AWS_SECONDARY_SECRET = 'aws-secret';

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('/myprofile', 'test-token', 'GET');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://cf-proxy.example.com/myprofile');
      expect(calledInit.method).toBe('GET');
      const h = calledInit.headers as Headers;
      expect(h.get('Authorization')).toBe('Bearer test-token');
      expect(h.get('x-proxy-secret')).toBe('cf-secret');
    });

    it('should handle endpoints with leading slash', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('/endpoint', 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.any(Object)
      );
    });

    it('should handle endpoints without leading slash', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData('endpoint', 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.any(Object)
      );
    });

    it('should handle backend URL with trailing slash', async () => {
      // Use unique endpoint to avoid cache
      const uniqueEndpoint = `/trail-test-${Date.now()}`;
      const originalUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com/';
      
      vi.clearAllMocks();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);

      // Should not have double slash
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.example.com${uniqueEndpoint}`,
        expect.any(Object)
      );
      
      // Restore
      process.env.NEXT_PUBLIC_BACKEND_URL = originalUrl;
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-ok responses', async () => {
      // Create unique endpoint to avoid cache
      const uniqueEndpoint = `/error-test-${Date.now()}`;
      
      vi.clearAllMocks();
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not Found' }),
      });

      await expect(
        fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`)
      ).rejects.toThrow('EzyGo API error: 404 Not Found');
    });

    describe('Circuit Breaker Status Code Mapping', () => {
      it('should throw NonBreakerError for 400 Bad Request', async () => {
        const uniqueEndpoint = `/error-400-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Bad Request' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).toBe('NonBreakerError');
          expect(error.message).toContain('400');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw NonBreakerError for 401 Unauthorized', async () => {
        const uniqueEndpoint = `/error-401-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ error: 'Unauthorized' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).toBe('NonBreakerError');
          expect(error.message).toContain('401');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw NonBreakerError for 403 Forbidden', async () => {
        const uniqueEndpoint = `/error-403-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({ error: 'Forbidden' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).toBe('NonBreakerError');
          expect(error.message).toContain('403');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw NonBreakerError for 404 Not Found', async () => {
        const uniqueEndpoint = `/error-404-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ error: 'Not Found' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).toBe('NonBreakerError');
          expect(error.message).toContain('404');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw NonBreakerError for 422 Unprocessable Entity', async () => {
        const uniqueEndpoint = `/error-422-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: async () => ({ error: 'Unprocessable Entity' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).toBe('NonBreakerError');
          expect(error.message).toContain('422');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw regular Error (not NonBreakerError) for 429 Rate Limited', async () => {
        const uniqueEndpoint = `/error-429-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => ({ error: 'Rate Limited' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).not.toBe('NonBreakerError');
          expect(error.name).toBe('Error');
          expect(error.message).toContain('429');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw regular Error (not NonBreakerError) for 500 Internal Server Error', async () => {
        const uniqueEndpoint = `/error-500-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'Server Error' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).not.toBe('NonBreakerError');
          expect(error.name).toBe('Error');
          expect(error.message).toContain('500');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw regular Error (not NonBreakerError) for 502 Bad Gateway', async () => {
        const uniqueEndpoint = `/error-502-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: async () => ({ error: 'Bad Gateway' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).not.toBe('NonBreakerError');
          expect(error.name).toBe('Error');
          expect(error.message).toContain('502');
        }
        expect(errorCaught).toBe(true);
      });

      it('should throw regular Error (not NonBreakerError) for 503 Service Unavailable', async () => {
        const uniqueEndpoint = `/error-503-${Date.now()}`;
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ error: 'Service Unavailable' }),
        });

        let errorCaught = false;
        try {
          await fetchEzygoData(uniqueEndpoint, `test-token-${Date.now()}`);
        } catch (error: any) {
          errorCaught = true;
          expect(error.name).not.toBe('NonBreakerError');
          expect(error.name).toBe('Error');
          expect(error.message).toContain('503');
        }
        expect(errorCaught).toBe(true);
      });
    });
  });

  describe('getRateLimiterStats', () => {
    it('should return rate limiter statistics', () => {
      const stats = getRateLimiterStats();

      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('maxConcurrent');
      expect(stats).toHaveProperty('cacheSize');
      
      expect(typeof stats.activeRequests).toBe('number');
      expect(typeof stats.queueLength).toBe('number');
      expect(typeof stats.maxConcurrent).toBe('number');
      expect(typeof stats.cacheSize).toBe('number');
    });

    it('should show correct maxConcurrent value', () => {
      const stats = getRateLimiterStats();
      expect(stats.maxConcurrent).toBe(3);
    });
  });

  describe('Cache Key Security', () => {
    it('should use SHA-256 hash for cache key (not token suffix)', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Two different tokens with same last 8 characters
      const token1 = 'prefix1-12345678';
      const token2 = 'prefix2-12345678';

      // Make requests with both tokens
      await Promise.all([
        fetchEzygoData('/endpoint', token1),
        fetchEzygoData('/endpoint', token2),
      ]);

      // Should make 2 separate requests (different token hashes)
      // This verifies tokens are hashed, not just using suffix
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Queue Management', () => {
    it('should enforce FIFO fairness - queued requests cannot be bypassed', async () => {
      // Use fake timers to control request timing
      vi.useFakeTimers();
      
      try {
        // Reset state first
        resetRateLimiterState();
        vi.clearAllMocks();
        
        const completionOrder: number[] = [];
        const resolvers: Array<() => void> = [];
        
        // Mock fetch to allow manual control over request completion
        (global.fetch as any).mockImplementation(async () => {
          return new Promise<any>((resolve) => {
            resolvers.push(() => {
              resolve({
                ok: true,
                json: async () => ({ data: 'test' }),
              });
            });
          });
        });
        
        // Start 3 requests to fill all concurrent slots
        const request1 = fetchEzygoData('/endpoint-1', 'token-1').then(() => completionOrder.push(1));
        const request2 = fetchEzygoData('/endpoint-2', 'token-2').then(() => completionOrder.push(2));
        const request3 = fetchEzygoData('/endpoint-3', 'token-3').then(() => completionOrder.push(3));
        
        // Advance timers to allow requests to start
        await vi.advanceTimersByTimeAsync(10);
        
        // Now all 3 slots are occupied, queue should be empty
        expect(getRateLimiterStats().activeRequests).toBe(3);
        expect(getRateLimiterStats().queueLength).toBe(0);
        
        // Queue two more requests (these will wait)
        const request4 = fetchEzygoData('/endpoint-4', 'token-4').then(() => completionOrder.push(4));
        const request5 = fetchEzygoData('/endpoint-5', 'token-5').then(() => completionOrder.push(5));
        
        await vi.advanceTimersByTimeAsync(10);
        
        // Verify queue has 2 items
        expect(getRateLimiterStats().queueLength).toBe(2);
        
        // Complete request 1 to free up a slot
        resolvers[0]();
        await vi.advanceTimersByTimeAsync(10);
        
        // Request 4 should have taken the slot (first in queue)
        expect(getRateLimiterStats().activeRequests).toBe(3); // Still 3 active
        expect(getRateLimiterStats().queueLength).toBe(1); // Queue reduced to 1
        
        // NOW create a new request while queue is non-empty
        const request6 = fetchEzygoData('/endpoint-6', 'token-6').then(() => completionOrder.push(6));
        
        await vi.advanceTimersByTimeAsync(10);
        
        // Request 6 should be queued (not bypass request 5)
        expect(getRateLimiterStats().queueLength).toBe(2); // Queue has request 5 and 6
        
        // Complete request 2 to free another slot
        resolvers[1]();
        await vi.advanceTimersByTimeAsync(10);
        
        // Request 5 should take the slot (FIFO)
        expect(getRateLimiterStats().queueLength).toBe(1); // Only request 6 left
        
        // Complete request 3
        resolvers[2]();
        await vi.advanceTimersByTimeAsync(10);
        
        // Request 6 should take the slot
        expect(getRateLimiterStats().queueLength).toBe(0);
        
        // Complete remaining requests
        resolvers[3]();
        await vi.advanceTimersByTimeAsync(10);
        resolvers[4]();
        await vi.advanceTimersByTimeAsync(10);
        resolvers[5]();
        await vi.advanceTimersByTimeAsync(10);
        
        // Wait for all promises to resolve
        await Promise.all([request1, request2, request3, request4, request5, request6]);
        
        // Verify FIFO order: requests completed in the order they were made
        // Request 6 (which arrived late but while queue was non-empty) should come AFTER request 5
        expect(completionOrder).toEqual([1, 2, 3, 4, 5, 6]);
        
        // Clean up
        resetRateLimiterState();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw QueueFullError when queue is full', async () => {
      // Use fake timers to prevent real 30s timeouts
      vi.useFakeTimers();
      
      try {
        // Reset state first
        resetRateLimiterState();
        vi.clearAllMocks();
        
        // Create a long-running fetch that respects AbortSignal
        (global.fetch as any).mockImplementation((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
            // Don't resolve - simulates a slow request
          });
        });
        
        // Fill up all 3 concurrent slots + 100 queue slots
        const requests = [];
        for (let i = 0; i < 103; i++) {
          requests.push(
            fetchEzygoData(`/endpoint-${i}`, `token-${i}`).catch(e => e)
          );
        }
        
        // Advance timers slightly to allow promises to start
        await vi.advanceTimersByTimeAsync(10);
        
        // The 104th request should fail immediately with QueueFullError
        try {
          await fetchEzygoData('/endpoint-104', 'token-104');
          expect.fail('Should have thrown QueueFullError');
        } catch (error: any) {
          expect(error.name).toBe('QueueFullError');
          expect(error.message).toContain('Request queue is full');
          expect(error.message).toContain('100 items');
        }
        
        // Advance timers to trigger timeouts and clean up pending requests
        await vi.advanceTimersByTimeAsync(20000);
        
        // Clean up - reset state for other tests
        resetRateLimiterState();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should evict queue errors from cache to allow retry', async () => {
      // Use fake timers to prevent real 30s timeouts
      vi.useFakeTimers();
      
      try {
        // Reset state first
        resetRateLimiterState();
        vi.clearAllMocks();
        
        // Create a long-running fetch that respects AbortSignal
        (global.fetch as any).mockImplementation((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
            // Don't resolve - simulates a slow request
          });
        });
        
        // Fill up all 3 concurrent slots + 100 queue slots
        const requests = [];
        for (let i = 0; i < 103; i++) {
          requests.push(
            fetchEzygoData(`/endpoint-${i}`, `token-${i}`).catch(e => e)
          );
        }
        
        // Advance timers slightly to allow promises to start
        await vi.advanceTimersByTimeAsync(10);
        
        // Make the same request twice - both should fail with QueueFullError
        // If cache wasn't evicted, the second would return the cached rejection
        const endpoint = '/test-eviction';
        const token = 'test-token';
        
        const initialCacheSize = getRateLimiterStats().cacheSize;
        
        try {
          await fetchEzygoData(endpoint, token);
          expect.fail('First request should have thrown QueueFullError');
        } catch (error: any) {
          expect(error.name).toBe('QueueFullError');
        }
        
        // Allow time for cache eviction to complete
        await vi.advanceTimersByTimeAsync(10);
        
        // Verify cache was evicted after QueueFullError
        const cacheSizeAfterFirstError = getRateLimiterStats().cacheSize;
        expect(cacheSizeAfterFirstError).toBe(initialCacheSize); // No increase, error was evicted
        
        // Second request should also fail with QueueFullError (not cached)
        try {
          await fetchEzygoData(endpoint, token);
          expect.fail('Second request should have thrown QueueFullError');
        } catch (error: any) {
          expect(error.name).toBe('QueueFullError');
          // If it was cached, we'd get the same promise rejection
          // The fact that it throws again proves cache was evicted
        }
        
        // Allow time for cache eviction to complete
        await vi.advanceTimersByTimeAsync(10);
        
        // Verify cache still hasn't grown (both errors were evicted)
        const cacheSizeAfterSecondError = getRateLimiterStats().cacheSize;
        expect(cacheSizeAfterSecondError).toBe(initialCacheSize);
        
        // Advance timers to trigger timeouts and clean up pending requests
        await vi.advanceTimersByTimeAsync(20000);
        
        // Clean up
        resetRateLimiterState();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
