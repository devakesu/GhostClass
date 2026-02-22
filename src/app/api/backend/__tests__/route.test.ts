import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Set environment variables BEFORE any imports using vi.hoisted
// This ensures they're available when the route module's top-level constants are initialized
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.example.com');
});

// Mock the security modules before importing route
vi.mock('@/lib/security/auth-cookie', () => ({
  getAuthTokenServer: vi.fn(() => Promise.resolve('mock-token')),
}));

vi.mock('@/lib/security/csrf', () => ({
  validateCsrfToken: vi.fn(() => Promise.resolve(true)),
}));

// Mock fetch for upstream API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Backend Proxy Route', () => {
  type RouteModule = typeof import('../[...path]/route');
  let GET: RouteModule['GET'];
  let POST: RouteModule['POST'];
  let PUT: RouteModule['PUT'];
  let PATCH: RouteModule['PATCH'];
  let DELETE: RouteModule['DELETE'];
  let HEAD: RouteModule['HEAD'];

  // Local helper that mirrors the old `forward(request, method, path)` call signature,
  // routing each call to the corresponding exported HTTP handler.
  async function forward(request: NextRequest, method: string, path: string[]): Promise<Response> {
    const ctx = { params: Promise.resolve({ path }) };
    switch (method.toUpperCase()) {
      case 'GET':    return GET(request, ctx);
      case 'POST':   return POST(request, ctx);
      case 'PUT':    return PUT(request, ctx);
      case 'PATCH':  return PATCH(request, ctx);
      case 'DELETE': return DELETE(request, ctx);
      case 'HEAD':   return HEAD(request, ctx);
      default: throw new Error(`Unsupported method in test: ${method}`);
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Ensure env vars are set for each test (in case global afterEach clears them)
    // Note: This won't affect module-level constants that were already initialized,
    // but ensures env vars are available for any runtime checks
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.example.com');
    
    // Import module in beforeEach to ensure it uses the correct env vars
    if (!GET) {
      const routeModule = await import('../[...path]/route');
      GET = routeModule.GET;
      POST = routeModule.POST;
      PUT = routeModule.PUT;
      PATCH = routeModule.PATCH;
      DELETE = routeModule.DELETE;
      HEAD = routeModule.HEAD;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CSRF Protection', () => {
    it('should enforce CSRF validation for POST requests', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Invalid CSRF token');
    });

    it('should allow POST requests with valid CSRF token', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(true);

      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(200);
    });

    it('should skip CSRF validation for GET requests', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      
      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      await forward(request, 'GET', ['users']);
      
      // validateCsrfToken should not be called for GET
      expect(validateCsrfToken).not.toHaveBeenCalled();
    });

    it('should enforce CSRF validation for PUT requests', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'PUT',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'PUT', ['users', '1']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Invalid CSRF token');
    });

    it('should enforce CSRF validation for PATCH requests', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'PATCH', ['users', '1']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Invalid CSRF token');
    });

    it('should enforce CSRF validation for DELETE requests', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'DELETE', ['users', '1']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Invalid CSRF token');
    });
  });

  describe('Origin Validation', () => {
    it('should reject POST requests without origin header', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication.');
    });

    it('should reject POST requests from unauthorized origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
        headers: {
          origin: 'http://evil.com',
        },
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Origin not allowed. This endpoint only accepts requests from authorized domains.');
    });

    it('should accept POST requests from allowed origins', async () => {
      const { validateCsrfToken } = await import('@/lib/security/csrf');
      vi.mocked(validateCsrfToken).mockResolvedValue(true);

      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(200);
    });

    it('should enforce origin validation for authenticated GET requests (SEC-04)', async () => {
      // GET requests to non-public paths must include a valid Origin header.
      // This prevents cross-origin data exfiltration (e.g. attendance records).
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        // No origin header
      });

      const response = await forward(request, 'GET', ['users']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication.');
    });

    it('should reject GET requests from unauthorized origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://evil.com',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Origin not allowed. This endpoint only accepts requests from authorized domains.');
    });

    it('should accept GET requests from allowed origins', async () => {
      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      expect(response.status).toBe(200);
    });

    it('should handle invalid origin URLs', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'POST',
        headers: {
          origin: 'not-a-valid-url',
        },
      });

      const response = await forward(request, 'POST', ['users']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Invalid origin header format');
    });

    it('should reject PUT requests without origin header', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'PUT',
      });

      const response = await forward(request, 'PUT', ['users', '1']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication.');
    });

    it('should reject PATCH requests from unauthorized origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'PATCH',
        headers: {
          origin: 'http://evil.com',
        },
      });

      const response = await forward(request, 'PATCH', ['users', '1']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Origin not allowed. This endpoint only accepts requests from authorized domains.');
    });

    it('should reject DELETE requests from unauthorized origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users/1', {
        method: 'DELETE',
        headers: {
          origin: 'http://evil.com',
        },
      });

      const response = await forward(request, 'DELETE', ['users', '1']);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe('Origin not allowed. This endpoint only accepts requests from authorized domains.');
    });
  });

  describe('Path Validation', () => {
    it('should reject requests with missing path', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend', {
        method: 'GET',
      });

      const response = await forward(request, 'GET', []);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Missing path');
    });

    it('should reject requests with query parameters in path segments', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
      });

      // Simulate path segment containing query parameter (defense in depth)
      const response = await forward(request, 'GET', ['users?admin=true']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Invalid path format');
    });

    it('should reject requests with fragment identifiers in path segments', async () => {
      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
      });

      // Simulate path segment containing fragment (defense in depth)
      const response = await forward(request, 'GET', ['users#section']);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe('Invalid path format');
    });

    it('should accept valid path segments', async () => {
      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users/123', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users', '123']);
      expect(response.status).toBe(200);
    });
  });

  describe('Timeout and Abort Handling', () => {
    it('should return 502 with "Upstream timed out" message when request times out', async () => {
      // Mock a fetch that takes longer than the timeout (15 seconds)
      // We'll use fake timers to control time
      vi.useFakeTimers();
      
      try {
        // Mock fetch to reject with AbortError when signal is aborted
        // This simulates the behavior when a timeout occurs
        vi.mocked(mockFetch).mockImplementation(async (_url, init) => {
          const signal = init?.signal;
          
          // Fail fast if no AbortSignal is provided so the test doesn't hang silently
          if (!signal) {
            return Promise.reject(
              new Error('Missing AbortSignal in timeout test fetch mock')
            );
          }

          // If the signal is already aborted when fetch is called, reject immediately
          if (signal.aborted) {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            return Promise.reject(abortError);
          }
          
          return new Promise((_resolve, reject) => {
            // Reject with AbortError when signal fires abort event
            signal.addEventListener(
              'abort',
              () => {
                const abortError = new Error('The operation was aborted');
                abortError.name = 'AbortError';
                reject(abortError);
              },
              { once: true }
            );
            // Never resolve - simulates a hanging request until aborted
          });
        });

        const request = new NextRequest('http://localhost:3000/api/backend/users', {
          method: 'GET',
          headers: {
            origin: 'http://localhost',
          },
        });

        const responsePromise = forward(request, 'GET', ['users']);
        
        // Fast-forward past the 15-second timeout
        await vi.advanceTimersByTimeAsync(16000);
        
        const response = await responsePromise;
        
        // Should return 502 status
        expect(response.status).toBe(502);
        
        // Should return "Upstream timed out" message for AbortError
        const body = await response.json();
        expect(body.message).toBe('Upstream timed out');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should distinguish AbortError from other fetch failures', async () => {
      // Mock fetch to throw a non-abort error
      vi.mocked(mockFetch).mockRejectedValue(new Error('Network connection failed'));

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      
      // Should return 502 status
      expect(response.status).toBe(502);
      
      // Should return generic "Upstream fetch failed" message (not timeout-specific)
      const body = await response.json();
      expect(body.message).toBe('Upstream fetch failed');
    });
  });

  describe('Rate Limiting (429) Handling', () => {
    beforeEach(async () => {
      // Reset circuit breaker before each test to ensure clean state
      const { ezygoCircuitBreaker } = await import('@/lib/circuit-breaker');
      ezygoCircuitBreaker.reset();
    });

    it('should treat 429 as breaker-worthy and preserve error message in production', async () => {
      const rateLimitMessage = 'Rate limit exceeded. Please try again in 60 seconds.';
      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ message: rateLimitMessage }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      
      // Should preserve 429 status
      expect(response.status).toBe(429);
      
      // Should preserve rate-limit message even in production (not sanitized like 5xx)
      const body = await response.json();
      expect(body.message).toBe(rateLimitMessage);
    });

    it('should forward rate-limit headers from upstream 429 responses', async () => {
      const rateLimitMessage = 'Rate limit exceeded';
      vi.mocked(mockFetch).mockResolvedValue(
        new Response(JSON.stringify({ message: rateLimitMessage }), {
          status: 429,
          headers: { 
            'content-type': 'application/json',
            'retry-after': '60',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1707552000'
          },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      
      // Should preserve 429 status
      expect(response.status).toBe(429);
      
      // Should forward rate-limit headers to help clients back off
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.get('x-ratelimit-limit')).toBe('100');
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(response.headers.get('x-ratelimit-reset')).toBe('1707552000');
    });

    it('should treat 429 as breaker-worthy error (exercises circuit breaker path)', async () => {
      // Mock the circuit breaker module to track if execute was called
      const { ezygoCircuitBreaker } = await import('@/lib/circuit-breaker');
      const executeSpy = vi.spyOn(ezygoCircuitBreaker, 'execute');
      
      vi.mocked(mockFetch).mockResolvedValue(
        new Response('Too Many Requests', {
          status: 429,
          headers: { 'content-type': 'text/plain' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      const response = await forward(request, 'GET', ['users']);
      
      // Circuit breaker execute should have been called
      expect(executeSpy).toHaveBeenCalled();
      
      // Should return 429 status
      expect(response.status).toBe(429);
      
      // Clean up
      executeSpy.mockRestore();
    });

    it('should log 429 as warning (not error)', async () => {
      const { logger } = await import('@/lib/logger');
      const warnSpy = vi.spyOn(logger, 'warn');
      
      vi.mocked(mockFetch).mockResolvedValue(
        new Response('Rate limited', {
          status: 429,
          headers: { 'content-type': 'text/plain' },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/backend/users', {
        method: 'GET',
        headers: {
          origin: 'http://localhost',
        },
      });

      await forward(request, 'GET', ['users']);
      
      // Should log as warning with 429 context
      expect(warnSpy).toHaveBeenCalledWith(
        'Proxy upstream rate limit (429)',
        expect.objectContaining({
          status: 429
        })
      );
      
      // Clean up
      warnSpy.mockRestore();
    });
  });
});
