/**
 * Egress failover chain tests for the backend proxy route.
 *
 * These tests run in their own file to get a fresh module instance with CF and
 * AWS egress tier env vars pre-configured. The EGRESS_TARGETS array is computed
 * at module load time, so the env vars must be stubbed before the module is
 * imported (done via vi.hoisted below).
 *
 * Scenarios covered:
 * - Successful failover from CF (503) → AWS (200)
 * - Successful failover from CF (network error) → AWS (200)
 * - Non-retryable 4xx returned immediately without failover
 * - All tiers exhausted (CF 503, AWS 503, direct 503)
 * - x-egress-target header reflects the tier that actually served the response
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Must be hoisted before any module imports that transitively import server-only
vi.mock('server-only', () => ({}));

// Pre-configure CF + AWS egress tiers BEFORE importing the route module
// so that EGRESS_TARGETS is built with all three tiers (CF → AWS → direct).
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://direct.ezygo.example.com');
  vi.stubEnv('CF_PROXY_URL', 'https://cf.proxy.example.com');
  vi.stubEnv('CF_PROXY_SECRET', 'cf-secret-key');
  vi.stubEnv('AWS_SECONDARY_URL', 'https://aws.proxy.example.com');
  vi.stubEnv('AWS_SECONDARY_SECRET', 'aws-secret-key');
});

vi.mock('@/lib/security/auth-cookie', () => ({
  getAuthTokenServer: vi.fn(() => Promise.resolve('mock-token')),
}));

vi.mock('@/lib/security/csrf', () => ({
  validateCsrfToken: vi.fn(() => Promise.resolve(true)),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Backend Proxy Route – Egress Failover Chain', () => {
  type RouteModule = typeof import('../[...path]/route');
  let GET: RouteModule['GET'];

  beforeEach(async () => {
    vi.clearAllMocks();

    if (!GET) {
      const routeModule = await import('../[...path]/route');
      GET = routeModule.GET;
    }

    // Reset circuit breaker state before each test
    const { ezygoCircuitBreaker } = await import('@/lib/circuit-breaker');
    ezygoCircuitBreaker.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeGetRequest() {
    return new NextRequest('http://localhost:3000/api/backend/users', {
      method: 'GET',
      headers: { origin: 'http://localhost' },
    });
  }

  async function callGet(req: NextRequest) {
    const ctx = { params: Promise.resolve({ path: ['users'] }) };
    return GET(req, ctx);
  }

  it('should failover from CF (503) to AWS and return 200', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith('https://cf.proxy.example.com')) {
        return new Response('Service Unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    // CF was tried first, AWS succeeded second
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.headers.get('x-egress-target')).toBe('secondary (AWS)');
  });

  it('should failover from CF (network error) to AWS and return 200', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith('https://cf.proxy.example.com')) {
        throw new Error('Network connection failed');
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.headers.get('x-egress-target')).toBe('secondary (AWS)');
  });

  it('should NOT failover on non-retryable 4xx — returns 401 after a single attempt', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );

    const response = await callGet(makeGetRequest());

    // 401 is not retryable — returned immediately, no failover to AWS/direct
    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should try all three tiers and return 503 when all are exhausted', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response('Service Unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        })
      )
    );

    const response = await callGet(makeGetRequest());

    // All 3 tiers were attempted
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // The last UpstreamServerError (from direct tier) is bubbled up as 503
    expect(response.status).toBe(503);
  });

  it('should set x-egress-target to "direct" when CF and AWS both fail but direct succeeds', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (
        url.startsWith('https://cf.proxy.example.com') ||
        url.startsWith('https://aws.proxy.example.com')
      ) {
        return new Response('Bad Gateway', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(response.headers.get('x-egress-target')).toBe('direct');
  });
});
